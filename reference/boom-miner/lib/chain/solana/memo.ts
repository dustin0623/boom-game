/**
 * lib/chain/solana/memo.ts
 *
 * SPL Memo program helpers. Attaching a memo instruction to a payout
 * transaction records a human-readable reference (withdrawal / refund id)
 * directly on-chain, which makes reconciliation and support auditing easy.
 *
 * SERVER-ONLY.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Canonical SPL Memo program id (same on mainnet, devnet, testnet). */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

/** Namespaced memo for a withdrawal payout. */
export function buildWithdrawMemo(ref: string): string {
  return `boom-miner:withdraw:${ref}`;
}

/** Namespaced memo for a refund payout, referencing the original tx/withdrawal. */
export function buildRefundMemo(originalRef: string): string {
  return `boom-miner:refund:${originalRef}`;
}

/**
 * Builds a Memo-program instruction carrying `memo`.
 * The treasury signs the enclosing transaction, so no extra signer keys here.
 */
export function buildMemoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
}
