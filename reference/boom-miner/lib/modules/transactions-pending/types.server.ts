/**
 * lib/modules/transactions-pending/types.server.ts
 *
 * Types for the durable work queue (`transactions_pending`).
 * One row per requested withdrawal OR mint, drained sequentially by the
 * sidecar worker.
 *
 * No mongoose runtime code — only interfaces live here.
 */

import type { Document } from "mongoose";

export type InboundTxStatus = "pending" | "failed" | "dead";

/** Union kept open so deposit / marketplace types can be added later. */
export type TransactionType = "withdrawal" | "mint" | "marketplace_purchase";

export interface IInboundTransaction extends Document {
  type: TransactionType;
  /**
   * Idempotency key — unique across the queue.
   * - withdrawal: a server-generated UUID.
   * - mint: the on-chain transfer signature (txId) the player signed.
   */
  signature: string;

  /** Player's Solana address (payout recipient for withdrawal / minter for mint). */
  walletAddress: string;

  // ---- withdrawal fields --------------------------------------------------
  /** Whole coins requested. Present only when `type === "withdrawal"`. */
  withdrawAmount?: number;

  // ---- mint fields --------------------------------------------------------
  /** Number of heroes to mint. Present only when `type === "mint"`. */
  mintCount?: number;
  /** Deterministic hero numbers the player paid to mint. */
  mintedNumbers?: number[];

  // ---- marketplace_purchase fields ----------------------------------------
  /** Buyer's wallet address. Present only when `type === "marketplace_purchase"`. */
  buyerWallet?: string;
  /** Seller's wallet address (hero owner at time of listing). */
  sellerWallet?: string;
  /** Mongoose _id of the hero being purchased. */
  heroId?: string;
  /** Hero display name at time of purchase (denormalized for log). */
  heroName?: string;
  /** Hero rarity at time of purchase (denormalized for log). */
  heroRarity?: string;
  /** Token price the buyer paid (whole tokens, matches hero.market.price). */
  purchasePrice?: number;

  // ---- lifecycle ----------------------------------------------------------
  status: InboundTxStatus;
  retryCount: number;
  lastError?: string;

  // timestamps: true → these are managed by mongoose
  createdAt: Date;
  updatedAt: Date;
}
