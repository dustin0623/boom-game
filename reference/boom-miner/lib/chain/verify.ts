/**
 * lib/chain/verify.ts
 *
 * Chain-agnostic router for on-chain deposit verification.
 * Delegates to the active chain's verifier based on NEXT_PUBLIC_CHAIN.
 *
 * Uses dynamic imports so only the active chain's dependencies are loaded
 * at runtime — the inactive chain modules (ethers, dhive, etc.) are never
 * required in the same process.
 *
 * SERVER-ONLY.
 */

import { config } from "@/lib/config/config";
import type { DepositVerification, VerifyDepositOptions } from "@/lib/chain/solana/verify";

export type { DepositVerification, VerifyDepositOptions };

export async function verifyDepositFromPlayer(
  txId: string,
  expectedPlayerWallet: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> {
  const chain = config.blockchain.chain;

  if (chain === "robinhood") {
    const { verifyDepositFromPlayer: verify } = await import("./robinhood/verify");
    return verify(txId, expectedPlayerWallet, expectedAmount, opts);
  }

  if (chain === "hive") {
    const { verifyDepositFromPlayer: verify } = await import("./hive/verify");
    return verify(txId, expectedPlayerWallet, expectedAmount, opts);
  }

  // Default: Solana
  const { verifyDepositFromPlayer: verify } = await import("./solana/verify");
  return verify(txId, expectedPlayerWallet, expectedAmount, opts);
}
