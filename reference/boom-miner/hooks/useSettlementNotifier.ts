"use client";

/**
 * hooks/useSettlementNotifier.ts
 *
 * Global poller that watches the processed-transaction ledger for newly-settled
 * mints and withdrawals, then asks the WS engine for an authoritative refresh.
 *
 * Flow (see docs/solana-mint-and-withdrawal-architecture.md):
 *   1. The browser NEVER mints/withdraws directly — it only enqueues a pending
 *      row. The Solana smart-contract worker settles it asynchronously and
 *      writes a `transactions_processed` ledger row.
 *   2. This hook polls GET /api/transactions and diffs the returned txHashes
 *      against a baseline captured on the first fetch.
 *   3. On any NEW settled txHash it:
 *        - records a store marker (lastMintTxHash / lastWithdrawalTxHash) so
 *          modals can react to their own completion, and
 *        - emits WS_EVENTS.PLAYER_SYNC so the engine pushes fresh coins + stage
 *          + roster back over player:state (applied by WSSyncManager).
 *
 * Mount once, high in the game tree (GameModals). It is a no-op until the
 * player is authenticated (a bm_token exists).
 */

import { useEffect, useRef } from "react";
import { requestGameSync } from "@/context/SocketContext";
import { useGameStore } from "@/features/store/gameStore";

/** Poll cadence. Kept modest — settlement is worker-paced, not instant. */
const POLL_INTERVAL_MS = 4000;
const PAGE_LIMIT = 25;

export interface SettledMintMetadata {
  type: "mint";
  heroIds: string[];
  mintedNumbers: number[];
  count: number;
}

export interface ProcessedTx {
  txHash: string;
  type: "mint" | "withdrawal";
  amount: number;
  processedAt: number;
  metadata?: SettledMintMetadata | { type: "withdrawal"; payoutTxHash: string };
}

interface TransactionsResponse {
  success: boolean;
  transactions?: ProcessedTx[];
  nextCursor?: number | null;
}

export function useSettlementNotifier(): void {
  const setSettlement = useGameStore((s) => s.setSettlement);
  // Wallet presence gates polling; a logged-out shell shouldn't hit the API.
  const wallet = useGameStore((s) => s.wallet);

  // txHashes we've already accounted for. `null` until the baseline lands so a
  // freshly-mounted client doesn't treat historical settlements as "new".
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!wallet) return;
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("bm_token");
    if (!token) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/transactions?limit=${PAGE_LIMIT}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as TransactionsResponse;
        if (cancelled || !res.ok || !data.success || !Array.isArray(data.transactions)) return;

        const txs = data.transactions;

        // First successful fetch establishes the baseline — no notifications.
        if (seen.current === null) {
          seen.current = new Set(txs.map((t) => t.txHash));
          return;
        }

        // Detect newly-settled rows (oldest-first so markers land in order).
        const fresh = txs
          .filter((t) => !seen.current!.has(t.txHash))
          .sort((a, b) => a.processedAt - b.processedAt);

        if (fresh.length === 0) return;

        let sawMint = false;
        let sawWithdrawal = false;
        for (const tx of fresh) {
          seen.current!.add(tx.txHash);
          setSettlement(tx.type, tx.txHash, tx);
          if (tx.type === "mint") sawMint = true;
          if (tx.type === "withdrawal") sawWithdrawal = true;
        }

        // One authoritative refresh covers every fresh settlement this cycle.
        if (sawMint || sawWithdrawal) {
          requestGameSync();
        }
      } catch {
        /* transient network error — retry on the next tick */
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [wallet, setSettlement]);
}
