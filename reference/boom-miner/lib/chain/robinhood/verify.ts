/**
 * lib/chain/robinhood/verify.ts
 *
 * Verifies a player → treasury ERC-20 transfer on Robinhood Chain (EVM L2,
 * chain id 4663) that was signed IN THE BROWSER by the player
 * (see lib/client/robinhood/deposit.ts).
 *
 * This is the mint-time counterpart to the treasury → player payout in
 * lib/chain/robinhood/transfer.ts. The server does NOT sign anything here — it
 * only reads the confirmed receipt back from the chain and asserts that the
 * correct amount of the configured ERC-20 token moved from the player to the
 * treasury.
 *
 * Pure chain operation: does NOT touch MongoDB. Callers own idempotency and
 * any DB mutation (hero inserts, ledger rows).
 *
 * SERVER-ONLY — reads treasury/token config. Never import from a 'use client' file.
 */

import { Interface, parseUnits } from "ethers";
import { getProvider, resetProvider, ERC20_ABI, getTokenDecimals } from "./rpc";
import { config } from "@/lib/config/config";

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

/** ERC-20 Transfer event interface for log parsing. */
const erc20Interface = new Interface(ERC20_ABI as unknown as string[]);

/**
 * Verifies that `txHash` is a confirmed Robinhood Chain transaction in which:
 *   - the player (expectedPlayerWallet) initiated the transaction, AND
 *   - the ERC-20 token contract emitted a Transfer event with `to` equal to
 *     the treasury, AND
 *   - the total transferred amount equals exactly `expectedAmount` whole tokens.
 *
 * The receipt may be null briefly after the browser submits, so we short-poll
 * before giving up. The worker passes maxTries: 2 and retries via the queue.
 *
 * Returns { valid: true } on success, or { valid: false, reason, code } otherwise.
 * Does NOT touch MongoDB.
 */
export async function verifyDepositFromPlayer(
  txHash: string,
  expectedPlayerWallet: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> {
  if (!txHash || typeof txHash !== "string") {
    return { valid: false, code: "INVALID", reason: "Missing transaction hash" };
  }

  const tokenAddress = config.blockchain.robinhood.tokenAddress;
  if (!tokenAddress) {
    return { valid: false, code: "INVALID", reason: "ROBINHOOD_TOKEN_ADDRESS is not configured" };
  }

  const treasury = config.blockchain.treasuryAddress;
  if (!treasury) {
    return { valid: false, code: "INVALID", reason: "TREASURY_ADDRESS is not configured" };
  }

  const provider = getProvider();
  const decimals = await getTokenDecimals();
  const expectedRaw = parseUnits(String(expectedAmount), decimals);

  const MAX_TRIES = opts.maxTries ?? 12;
  const DELAY_MS = opts.delayMs ?? 2000;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let receipt;
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (err) {
      // RPC error — treat as transient. Reset provider so the next attempt
      // gets a fresh connection, then retry if attempts remain.
      resetProvider();
      if (attempt < MAX_TRIES - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }
      return {
        valid: false,
        code: "NOT_CONFIRMED",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (!receipt) {
      // Not visible yet — wait and retry.
      if (attempt < MAX_TRIES - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }
      return { valid: false, code: "NOT_CONFIRMED", reason: "Transaction not found or not yet confirmed" };
    }

    // Step 2: tx must have succeeded.
    if (receipt.status !== 1) {
      return { valid: false, code: "INVALID", reason: "Transaction reverted on-chain" };
    }

    // Step 3: tx must have been sent by the expected player wallet.
    if (receipt.from.toLowerCase() !== expectedPlayerWallet.toLowerCase()) {
      return {
        valid: false,
        code: "INVALID",
        reason: "Signed by wrong address",
      };
    }

    // Step 4-5: parse Transfer logs emitted by the token contract and sum
    // the value of logs where `to` is the treasury.
    let totalReceived = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
      let parsed;
      try {
        parsed = erc20Interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        // Not a Transfer event (or doesn't match) — skip.
        continue;
      }
      if (!parsed || parsed.name !== "Transfer") continue;
      const to: string = parsed.args[1] as string;
      if (to.toLowerCase() !== treasury.toLowerCase()) continue;
      totalReceived += parsed.args[2] as bigint;
    }

    // Step 6: total received must be at least the expected amount.
    // Over-payments (smart wallets, fee-on-transfer wrappers) are accepted.
    if (totalReceived < expectedRaw) {
      return {
        valid: false,
        code: "INVALID",
        reason: `Treasury received ${totalReceived} base units, expected at least ${expectedRaw}`,
      };
    }

    // Step 7: all checks passed.
    return { valid: true };
  }

  return { valid: false, code: "NOT_CONFIRMED", reason: "Transaction not found or not yet confirmed" };
}
