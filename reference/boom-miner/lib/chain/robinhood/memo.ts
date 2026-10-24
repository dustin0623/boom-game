/**
 * lib/chain/robinhood/memo.ts
 *
 * Memo helpers for the Robinhood EVM chain.
 *
 * ERC-20 `transfer` has no native memo field, so a memo is carried two ways:
 *   - Off-chain: the canonical string is stored on the DB transaction record.
 *   - On-chain (optional): as hex-encoded calldata on a 0-value tx to the
 *     recipient, which appears in the tx input and can be decoded later.
 *
 * SERVER-ONLY.
 */

import { hexlify, toUtf8Bytes } from "ethers";

/** Namespaced memo for a withdrawal payout. */
export function buildWithdrawMemo(ref: string): string {
  return `boom-miner:withdraw:${ref}`;
}

/** Namespaced memo for a refund payout, referencing the original tx/withdrawal. */
export function buildRefundMemo(originalRef: string): string {
  return `boom-miner:refund:${originalRef}`;
}

/** Encodes a memo string as `0x`-prefixed hex suitable for a tx `data` field. */
export function encodeMemoHex(memo: string): string {
  return hexlify(toUtf8Bytes(memo));
}
