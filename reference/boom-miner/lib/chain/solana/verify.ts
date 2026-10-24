/**
 * lib/chain/solana/verify.ts
 *
 * Verifies a player -> treasury SPL-token transfer that was signed and
 * submitted IN THE BROWSER by the player (see lib/client/solana/deposit.ts).
 *
 * This is the mint-time counterpart to the treasury -> player payout in
 * lib/chain/solana/transfer.ts. Here the server does NOT sign anything — it
 * only reads the confirmed transaction back from the chain and asserts that
 * the correct amount of the correct mint moved from the player to the treasury.
 *
 * Pure chain operation: does NOT touch MongoDB. Callers own idempotency and
 * any DB mutation (hero inserts, ledger rows).
 *
 * SERVER-ONLY — reads treasury/mint config. Never import from a 'use client' file.
 */

import { config } from "@/lib/config/config";
import { getConnection, getMintDecimals } from "./rpc";

const solana = config.blockchain.solana;

export interface DepositVerification {
  valid: boolean;
  reason?: string;
  /**
   * Failure classification for the caller:
   *   - "NOT_CONFIRMED": the tx isn't visible / confirmed on-chain YET. Retryable.
   *   - "INVALID": the tx is confirmed but does not satisfy the payment rules.
   *     Terminal — retrying will never make it valid.
   */
  code?: "NOT_CONFIRMED" | "INVALID";
}

export interface VerifyDepositOptions {
  /** How many times to poll for confirmation before returning NOT_CONFIRMED. */
  maxTries?: number;
  /** Delay between polls in milliseconds. */
  delayMs?: number;
}

/** Converts a whole-token amount to base units using string math (no float loss). */
function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const [whole, frac = ""] = String(amount).split(".");
  const paddedFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

/** Sums the SPL balance (base units) of accounts owned by `owner` for `mint`. */
function sumOwnerBalance(
  balances:
    | Array<{ mint: string; owner?: string; uiTokenAmount: { amount: string } }>
    | null
    | undefined,
  owner: string,
  mint: string,
): bigint {
  if (!balances) return 0n;
  let total = 0n;
  for (const b of balances) {
    if (b.mint === mint && b.owner === owner) {
      total += BigInt(b.uiTokenAmount.amount);
    }
  }
  return total;
}

/**
 * Verifies that `signature` is a confirmed Solana transaction in which:
 *   - the player (expectedPlayerWallet) signed the transaction, AND
 *   - the treasury's associated token account received EXACTLY
 *     `expectedAmount` whole tokens of the configured mint.
 *
 * Because the treasury's on-chain token balance delta is checked directly
 * (post - pre), this is robust to ATA-creation instructions, memos, and any
 * extra instructions the wallet may add.
 *
 * The transaction may not be confirmed the instant the browser hands us the
 * signature, so we poll a few times before giving up.
 *
 * Returns { valid: true } on success, or { valid: false, reason } otherwise.
 * Does NOT touch MongoDB.
 */
export async function verifyDepositFromPlayer(
  signature: string,
  expectedPlayerWallet: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> {
  if (!signature || typeof signature !== "string") {
    return { valid: false, code: "INVALID", reason: "Missing transaction signature" };
  }
  if (!solana.mint) {
    return { valid: false, code: "INVALID", reason: "Server mint address is not configured" };
  }

  const connection = getConnection();
  const mint = solana.mint;
  const treasury = config.blockchain.treasuryAddress;

  // Fetch live decimals from the Token-2022 mint — correct for Pump.fun tokens
  // that may not use the standard 9 decimal places.
  const decimals = await getMintDecimals();
  const expectedRaw = toBaseUnits(expectedAmount, decimals);

  // Poll for confirmation — the wallet submits the tx but it may take a moment
  // to land. Callers running inside the durable worker pass a SHORT poll
  // (e.g. maxTries: 1-2) and rely on the queue's poll interval for backoff, so
  // a slow-confirming tx is retried on the next drain instead of blocking.
  const MAX_TRIES = opts.maxTries ?? 12;
  const DELAY_MS = opts.delayMs ?? 2000;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let tx;
    try {
      tx = await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch (err) {
      // RPC error reading the tx — treat as transient (retryable).
      return {
        valid: false,
        code: "NOT_CONFIRMED",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (!tx) {
      // Not visible yet — wait and retry.
      if (attempt < MAX_TRIES - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }
      return { valid: false, code: "NOT_CONFIRMED", reason: "Transaction not found or not yet confirmed" };
    }

    if (tx.meta?.err) {
      return { valid: false, code: "INVALID", reason: "Transaction failed on-chain" };
    }

    // Confirm the player actually signed this transaction.
    const signedByPlayer = tx.transaction.message.accountKeys.some(
      (k) => k.signer && String(k.pubkey) === expectedPlayerWallet,
    );
    if (!signedByPlayer) {
      return {
        valid: false,
        code: "INVALID",
        reason: "Transaction was not signed by the authenticated wallet",
      };
    }

    // Treasury token balance delta for the configured mint.
    const treasuryPre = sumOwnerBalance(tx.meta?.preTokenBalances, treasury, mint);
    const treasuryPost = sumOwnerBalance(tx.meta?.postTokenBalances, treasury, mint);
    const treasuryDelta = treasuryPost - treasuryPre;

    if (treasuryDelta !== expectedRaw) {
      return {
        valid: false,
        code: "INVALID",
        reason: `Treasury received ${treasuryDelta} base units, expected ${expectedRaw}`,
      };
    }

    // Sanity check: the player's balance for this mint dropped by the amount.
    const playerPre = sumOwnerBalance(tx.meta?.preTokenBalances, expectedPlayerWallet, mint);
    const playerPost = sumOwnerBalance(tx.meta?.postTokenBalances, expectedPlayerWallet, mint);
    if (playerPre - playerPost < expectedRaw) {
      return {
        valid: false,
        code: "INVALID",
        reason: "Sender token balance did not decrease by the expected amount",
      };
    }

    return { valid: true };
  }

  return { valid: false, code: "NOT_CONFIRMED", reason: "Transaction not found or not yet confirmed" };
}
