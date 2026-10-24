"use client";

import { useEffect, useRef, useState } from "react";
import {
  ModalShell,
  ModalTitleBar,
  ActionDock,
  SectionLabel,
  StatChip,
} from "@/components/ui/modal";
import { useGameStore } from "@/features/store/gameStore";
import { activeChain }   from "@/lib/client/chain";
import { chainBranding } from "@/lib/config/branding";

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

const WALLET_ENABLED = process.env.NEXT_PUBLIC_WALLET_ENABLED === "true";

const ACTIVE_CHAIN = activeChain;
const { tokenName } = chainBranding[ACTIVE_CHAIN];

const EXPLORER_BASE: Record<string, string> = {
  solana:    "https://solscan.io/tx/",
  robinhood: "https://robinhoodchain.blockscout.com/tx/",
  hive:      "https://hiveblocks.com/tx/",
};

const CHAIN_LABEL: Record<string, string> = {
  solana:    "Solana",
  robinhood: "Robinhood Chain",
  hive:      "Hive",
};

const explorerBase = EXPLORER_BASE[ACTIVE_CHAIN] ?? EXPLORER_BASE.solana;
const chainLabel   = CHAIN_LABEL[ACTIVE_CHAIN]   ?? "the blockchain";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES   = 20;

type Phase = "idle" | "submitting" | "pending" | "done" | "error";

interface ProcessedTx {
  txHash:      string;
  wallet:      string;
  type:        string;
  amount:      number;
  processedAt: number;
}

function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toString();
}

function shortSig(sig: string): string {
  return sig.length > 16 ? `${sig.slice(0, 8)}…${sig.slice(-6)}` : sig;
}

export interface WithdrawDebugInitial {
  phase?:      Phase;
  amount?:     string;
  error?:      string;
  settledSig?: string;
}

interface Props {
  show:          boolean;
  onClose:       () => void;
  debugInitial?: WithdrawDebugInitial;
}

export function WithdrawModal({ show, onClose, debugInitial }: Props) {
  const coins     = useGameStore((s) => s.coins);
  const reconcile = useGameStore((s) => s.reconcile);

  const [amount,     setAmount]     = useState<string>(debugInitial?.amount ?? "");
  const [phase,      setPhase]      = useState<Phase>(debugInitial?.phase ?? "idle");
  const [error,      setError]      = useState<string | null>(debugInitial?.error ?? null);
  const [settledSig, setSettledSig] = useState<string | null>(debugInitial?.settledSig ?? null);

  // How long (seconds) we've been in "pending" — for Issue 7 progress text.
  const [pendingSeconds, setPendingSeconds] = useState(0);

  const pollTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const baselineSig  = useRef<string | null>(null);

  const numeric    = Number(amount);
  const validAmount = Number.isInteger(numeric) && numeric >= 1 && numeric <= coins;

  const stopPolling = () => {
    if (pollTimer.current)    { clearTimeout(pollTimer.current);     pollTimer.current = null; }
    if (pendingTimer.current) { clearInterval(pendingTimer.current); pendingTimer.current = null; }
  };

  useEffect(() => stopPolling, []);

  // Issue 1 — reset state when modal re-opens (skip in debug mode).
  useEffect(() => {
    if (!show || debugInitial) return;
    setPhase("idle");
    setAmount("");
    setError(null);
    setSettledSig(null);
    setPendingSeconds(0);
    stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const token       = () => typeof window !== "undefined" ? localStorage.getItem("bm_token") : null;
  const authHeaders = (): Record<string, string> => {
    const t = token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const fetchLatestSig = async (): Promise<string | null> => {
    const res = await fetch("/api/transactions?type=withdrawal&limit=1", {
      headers: { ...authHeaders() },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; transactions?: ProcessedTx[] };
    return data.transactions?.[0]?.txHash ?? null;
  };

  const pollForSettlement = (tries: number) => {
    pollTimer.current = setTimeout(async () => {
      const latest = await fetchLatestSig();
      if (latest && latest !== baselineSig.current) {
        setSettledSig(latest);
        setPhase("done");
        // Issue 1 — blank the amount on successful completion.
        setAmount("");
        reconcile({ coins: Math.max(0, coins - numeric) });
        stopPolling();
        return;
      }
      if (tries + 1 >= POLL_MAX_TRIES) {
        setPhase("pending");
        stopPolling();
        return;
      }
      pollForSettlement(tries + 1);
    }, POLL_INTERVAL_MS);
  };

  const handleWithdraw = async () => {
    if (!validAmount || phase === "submitting" || phase === "pending") return;
    setPhase("submitting");
    setError(null);
    setSettledSig(null);
    setPendingSeconds(0);

    try {
      baselineSig.current = await fetchLatestSig();

      const res = await fetch("/api/bank/withdraw", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body:    JSON.stringify({ amount: numeric }),
      });
      const data = (await res.json()) as { success: boolean; error?: string; code?: string };

      if (!res.ok || !data.success) {
        setError(
          data.code === "INSUFFICIENT_COINS"   ? `Not enough ${tokenName}`
          : data.code === "EXCEEDS_LIMIT"      ? "Daily withdrawal limit reached"
          : (data.error ?? "Withdrawal failed"),
        );
        setPhase("error");
        return;
      }

      setPhase("pending");
      // Issue 7 — start a seconds counter while pending.
      pendingTimer.current = setInterval(() => setPendingSeconds((s) => s + 1), 1000);
      pollForSettlement(0);
    } catch {
      setError("Network error — please try again");
      setPhase("error");
    }
  };

  const busy = phase === "submitting" || phase === "pending";

  const setPct = (pct: number) => {
    setAmount(String(Math.floor((coins * pct) / 100)));
  };

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  if (!WALLET_ENABLED) {
    return (
      <ModalShell
        show={show}
        onClose={handleClose}
        tier="panel"
        titleBar={
          <ModalTitleBar
            title="Withdraw"
            subtitle={`Cash out ${tokenName} to ${chainLabel}`}
            onClose={handleClose}
          />
        }
        actionDock={
          <ActionDock>
            <button
              type="button"
              onClick={handleClose}
              className="wood-frame-light wood-panel-inner px-5 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
              style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
            >
              CLOSE
            </button>
          </ActionDock>
        }
      >
        <div className="flex flex-col items-center gap-5 py-6 px-4 text-center">
          <div
            className="px-3 py-1 border border-amber-400/40 bg-amber-400/10"
            style={{ fontFamily: PIXEL_HEAD, fontSize: 8, color: "#facc15", letterSpacing: 3 }}
          >
            COMING SOON
          </div>
          <p style={{ fontFamily: PIXEL_BODY, fontSize: 20, color: "#f5e9c4", opacity: 0.7, lineHeight: 1.6, maxWidth: 280, margin: 0 }}>
            Withdrawals are not yet available. Check back for the official launch announcement.
          </p>
          <div style={{ width: 40, height: 4, background: "#facc15" }} />
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      show={show}
      onClose={handleClose}
      tier="panel"
      titleBar={
        <ModalTitleBar
          title="Withdraw"
          subtitle={`Cash out ${tokenName} to ${chainLabel}`}
          onClose={handleClose}
          extra={
            <StatChip
              icon="/assets/token.png"
              value={formatCoins(coins)}
              caption={tokenName}
            />
          }
        />
      }
      actionDock={
        // Issue 1 — done state gets its own two-button dock.
        phase === "done" ? (
          <ActionDock
            info={
              <span className="text-white/50" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
                Withdrawal complete
              </span>
            }
          >
            <button
              type="button"
              onClick={() => { setPhase("idle"); setAmount(""); setSettledSig(null); }}
              className="wood-frame-light wood-panel-inner px-4 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
              style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
            >
              WITHDRAW MORE
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="wood-frame-light wood-panel-inner px-5 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
              style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2, boxShadow: "0 0 0 3px #16a34a" }}
            >
              CLOSE
            </button>
          </ActionDock>
        ) : phase === "pending" ? (
          // Issue 7 — pending gets a safe-to-close CTA.
          <ActionDock
            info={
              <span className="text-white/50" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
                You can close — it processes in the background
              </span>
            }
          >
            <button
              type="button"
              onClick={handleClose}
              className="wood-frame-light wood-panel-inner px-5 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
              style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
            >
              CLOSE (PROCESSING)
            </button>
          </ActionDock>
        ) : (
          <ActionDock
            info={
              <span className="text-white/50" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
                {formatCoins(coins)} available
              </span>
            }
          >
            <button
              type="button"
              disabled={!validAmount || busy}
              onClick={handleWithdraw}
              className="wood-frame-light wood-panel-inner px-5 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                fontFamily: PIXEL_HEAD,
                fontSize: 9,
                letterSpacing: 2,
                boxShadow: validAmount && !busy ? "0 0 0 3px #16a34a" : undefined,
              }}
            >
              {phase === "submitting" ? "SENDING..." : "WITHDRAW"}
            </button>
          </ActionDock>
        )
      }
    >
      <div className="flex flex-col gap-4 p-2">

        {/* Issue 2 — full-width error banner, not a tiny 8px info-slot string. */}
        {error && (phase === "error") && (
          <div
            className="mx-0 mb-0 px-3 py-2 rounded border border-red-800 bg-red-950/60"
            style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#fca5a5" }}
          >
            {error}
          </div>
        )}

        {/* Amount entry */}
        <div>
          <SectionLabel className="mb-2">Amount</SectionLabel>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            max={coins}
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
            // Issue 10 — block e, E, +, -, . from being typed.
            onKeyDown={(e) => {
              if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
            }}
            placeholder="0"
            className="w-full bg-black/40 px-3 py-2 rounded text-white outline-none focus:brightness-110 disabled:opacity-60"
            style={{ fontFamily: PIXEL_BODY, fontSize: 22 }}
          />
          <div className="flex gap-2 mt-2">
            {[25, 50, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={busy || coins < 1}
                onClick={() => setPct(pct)}
                className="wood-frame-light wood-panel-inner flex-1 py-1.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}
              >
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="flex justify-between items-center bg-black/40 px-3 py-2 rounded">
          <span style={{ fontFamily: PIXEL_HEAD, fontSize: 8, color: "#777", letterSpacing: 1 }}>
            YOU RECEIVE
          </span>
          <span style={{ fontFamily: PIXEL_BODY, fontSize: 20, color: validAmount ? "#fbbf24" : "#dc2626" }}>
            {Number.isFinite(numeric) && numeric > 0 ? formatCoins(numeric) : "0"} {tokenName}
          </span>
        </div>

        {/* Issue 7 — pending state with progress affordance. */}
        {phase === "pending" && (
          <div className="flex flex-col gap-2 px-3 py-3 rounded bg-black/30" aria-live="polite">
            <div className="flex items-center gap-2">
              {/* Animated triple-dot */}
              <style>{`@keyframes bm-pulse-dot{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-yellow-400"
                    style={{ animation: `bm-pulse-dot 1.2s ease-in-out ${i * 0.4}s infinite` }}
                  />
                ))}
              </div>
              <span style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#facc15" }}>
                Settling on-chain{pendingSeconds > 0 ? ` (${pendingSeconds}s)` : ""}...
              </span>
            </div>
            <span style={{ fontFamily: PIXEL_BODY, fontSize: 14, color: "#777" }}>
              Settlement usually takes 10–30 seconds. You can close this — it processes in the background.
            </span>
          </div>
        )}

        {phase === "done" && settledSig && (
          <div className="flex flex-col gap-1 px-3 py-2 rounded bg-black/30" aria-live="polite">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#4ade80" }} />
              <span style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#4ade80" }}>
                Withdrawal complete!
              </span>
            </div>
            <a
              href={`${explorerBase}${settledSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:brightness-125 underline"
              style={{ fontFamily: PIXEL_BODY, fontSize: 14, color: "#93c5fd" }}
            >
              {shortSig(settledSig)}
            </a>
          </div>
        )}

        <p style={{ fontFamily: PIXEL_BODY, fontSize: 14, color: "#777" }}>
          Tokens are sent to your connected wallet by the treasury. Settlement is
          processed off-chain and confirmed on {chainLabel}.
        </p>
      </div>
    </ModalShell>
  );
}
