/**
 * lib/chain/hive/verify.ts
 *
 * Verifies a player → treasury Hive-Engine token transfer by calling the
 * Hive-Engine /rpc/blockchain endpoint directly via fetch. We do NOT use
 * sscjs here because the package is CJS-only and the project runs as ESM
 * (`"type": "module"` in package.json) — `require()` is not available.
 *
 * SERVER-ONLY. Never import from a 'use client' file.
 */

import { ENGINE_RPC_URL, getTreasuryAccount, getTokenSymbol, getTokenPrecision } from "./rpc";

/**
 * Hive-Engine has multiple API nodes. We try each in order so a single node
 * outage never blocks verification.
 */
const ENGINE_BLOCKCHAIN_NODES = [
  "https://api.hive-engine.com/rpc/blockchain",
  "https://engine.rishipanthee.com/rpc/blockchain",
  "https://herpc.dtools.dev/rpc/blockchain",
  ENGINE_RPC_URL.replace(/\/rpc\/?$/, "/rpc/blockchain").replace(/\/$/, ""),
];

/**
 * Calls the Hive-Engine /rpc/blockchain `getTransactionInfo` method, trying
 * each known engine node in order until one succeeds.
 */
async function getHiveEngineTransaction(trxId: string): Promise<{
  transactionId: string;
  sender:        string;
  contract:      string;
  action:        string;
  payload:       string;
  logs:          string;
} | null> {
  // Deduplicate node list while preserving order.
  const nodes = [...new Set(ENGINE_BLOCKCHAIN_NODES)];
  let lastErr: string = "unknown error";

  for (const nodeUrl of nodes) {
    try {
      const res = await fetch(nodeUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransactionInfo",
          params: { txid: trxId },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status} from ${nodeUrl}`;
        continue;
      }
      const json = (await res.json()) as {
        result?: {
          transactionId: string;
          sender:        string;
          contract:      string;
          action:        string;
          payload:       string;
          logs:          string;
        } | null;
      };
      return json.result ?? null;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      // Try next node.
    }
  }
  throw new Error(`Hive-Engine getTransactionInfo failed on all nodes: ${lastErr}`);
}

export interface DepositVerification {
  valid:   boolean;
  reason?: string;
  code?:   "NOT_CONFIRMED" | "INVALID";
}

export interface VerifyDepositOptions {
  maxTries?: number;
  delayMs?:  number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verifies that `trxId` is a confirmed, successful Hive-Engine tokens.transfer
 * from `expectedPlayerAccount` to the treasury for `expectedAmount` of the
 * configured token. Rejects fake txs by checking logs.errors.
 */
export async function verifyDepositFromPlayer(
  trxId: string,
  expectedPlayerAccount: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> {
  if (!trxId || typeof trxId !== "string") {
    return { valid: false, code: "INVALID", reason: "Missing transaction id" };
  }

  let treasury:  string;
  let symbol:    string;
  let precision: number;
  try {
    treasury  = getTreasuryAccount();
    symbol    = getTokenSymbol();
    precision = await getTokenPrecision(symbol);
  } catch (err) {
    return {
      valid:  false,
      code:   "INVALID",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const tolerance = 0.5 * Math.pow(10, -precision);
  const MAX_TRIES = opts.maxTries ?? 5;
  const DELAY_MS  = opts.delayMs  ?? 3000;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let tx: {
      transactionId: string;
      sender:        string;
      contract:      string;
      action:        string;
      payload:       string;
      logs:          string;
    } | null = null;

    try {
      tx = await getHiveEngineTransaction(trxId);
    } catch (err) {
      return {
        valid:  false,
        code:   "NOT_CONFIRMED",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (!tx) {
      if (attempt < MAX_TRIES - 1) {
        await delay(DELAY_MS);
        continue;
      }
      return {
        valid:  false,
        code:   "NOT_CONFIRMED",
        reason: "Transaction not yet visible on Hive-Engine — not confirmed",
      };
    }

    // ── Step 1: must be tokens.transfer ───────────────────────────────────
    if (tx.contract !== "tokens" || tx.action !== "transfer") {
      return {
        valid:  false,
        code:   "INVALID",
        reason: `Expected tokens.transfer, got ${tx.contract}.${tx.action}`,
      };
    }

    // ── Step 2: parse payload ─────────────────────────────────────────────
    let payload: { symbol?: string; to?: string; quantity?: string; memo?: string };
    try {
      payload = JSON.parse(tx.payload);
    } catch {
      return { valid: false, code: "INVALID", reason: "Could not parse transaction payload" };
    }

    // ── Step 3: check logs for contract errors (fake tx detection) ────────
    // If logs.errors is non-empty the Engine rejected the execution
    // (e.g. sender had insufficient balance).
    let logs: { errors?: string[] } = {};
    try { logs = JSON.parse(tx.logs); } catch { /* non-fatal */ }
    if (Array.isArray(logs.errors) && logs.errors.length > 0) {
      return {
        valid:  false,
        code:   "INVALID",
        reason: `Contract execution failed: ${logs.errors.join(", ")}`,
      };
    }

    // ── Step 4: sender must be the player ─────────────────────────────────
    if (tx.sender.toLowerCase() !== expectedPlayerAccount.toLowerCase()) {
      return {
        valid:  false,
        code:   "INVALID",
        reason: `Sender mismatch: got ${tx.sender}, expected ${expectedPlayerAccount}`,
      };
    }

    // ── Step 5: recipient must be treasury ────────────────────────────────
    if ((payload.to ?? "").toLowerCase() !== treasury.toLowerCase()) {
      return {
        valid:  false,
        code:   "INVALID",
        reason: `Recipient mismatch: got ${payload.to}, expected ${treasury}`,
      };
    }

    // ── Step 6: symbol must match ─────────────────────────────────────────
    if ((payload.symbol ?? "").toUpperCase() !== symbol.toUpperCase()) {
      return {
        valid:  false,
        code:   "INVALID",
        reason: `Symbol mismatch: got ${payload.symbol}, expected ${symbol}`,
      };
    }

    // ── Step 7: quantity must match ───────────────────────────────────────
    const receivedQty = parseFloat(payload.quantity ?? "0");
    if (Math.abs(receivedQty - expectedAmount) > tolerance) {
      return {
        valid:  false,
        code:   "INVALID",
        reason: `Quantity mismatch: received ${payload.quantity}, expected ${expectedAmount} ${symbol}`,
      };
    }

    return { valid: true };
  }

  return {
    valid:  false,
    code:   "NOT_CONFIRMED",
    reason: "Transaction not yet visible on Hive-Engine after max retries",
  };
}
