/**
 * lib/chain/hive/memo.ts
 *
 * Memo helpers for Hive-Engine token transfers. Unlike EVM chains, the
 * Hive-Engine `transfer` contract action has a native `memo` field, so these
 * strings are passed straight through into the transfer payload and are stored
 * on-chain as-is.
 *
 * SERVER-ONLY.
 */

/** Namespaced memo for a player → treasury mint payment. */
export function buildMintMemo(): string {
  return "boom-miner:mint";
}

/** Namespaced memo for a withdrawal payout. */
export function buildWithdrawMemo(ref: string): string {
  return `boom-miner:withdraw:${ref}`;
}

/** Namespaced memo for a refund payout, referencing the original tx/withdrawal. */
export function buildRefundMemo(originalRef: string): string {
  return `boom-miner:refund:${originalRef}`;
}
