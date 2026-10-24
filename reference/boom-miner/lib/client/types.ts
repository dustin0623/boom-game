/**
 * lib/client/types.ts
 *
 * Shared types for the client-side transfer helpers (player → treasury).
 *
 * These helpers are just thin wrappers around the player's browser wallet:
 * they build and submit a token transfer to the treasury and return the tx id.
 * The caller supplies the DepositParams (treasury address, token, amount, …)
 * — e.g. from a smart-contract config — so this file stays runtime-free
 * (no 'use client') and can be imported from anywhere.
 */

export type ChainId = "solana" | "robinhood" | "hive";

/**
 * Public, non-sensitive parameters needed to build and submit a transfer.
 * Contains only public data (treasury address, token, amount, etc.).
 */
export interface DepositParams {
  chain: ChainId;
  /** Treasury recipient — SPL/EVM address or Hive account username. */
  treasury: string;
  /** SPL mint address, ERC-20 contract address, or Hive-Engine symbol. */
  token: string;
  /** On-chain decimals (SPL/ERC-20) or Hive-Engine precision. */
  decimals: number;
  /** Whole-token amount the player intends to deposit. */
  amount: number;
  /** Optional memo attached to the transfer (Solana memo / Hive memo field). */
  memo?: string;
  /** Optional caller-supplied reference id, if you want to tag the transfer. */
  ref?: string;
  /** Solana JSON-RPC endpoint (needed to build/serialize the transaction). */
  rpcUrl?: string;
  /** Number of packs being minted (Solana server-build path). */
  qty?: number;
  /** Whole-token cost per single pack (used to derive qty when not supplied). */
  mintCost?: number;
  /** Robinhood EVM chain id (guardrail against wrong-network sends). */
  chainId?: number;
  /** Hive-Engine custom_json id (routes the op to the sidechain). */
  engineId?: string;
}

/** Result of a submitted deposit transfer. */
export interface DepositResult {
  /** Solana signature, EVM tx hash, or Hive consensus tx id. */
  txId: string;
}
