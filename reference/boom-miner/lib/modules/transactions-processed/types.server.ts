/**
 * lib/modules/transactions-processed/types.server.ts
 *
 * Types for the permanent settlement ledger (`transactions_processed`).
 * One row per settled withdrawal — the audit + history source of truth.
 *
 * No mongoose runtime code — only interfaces live here.
 */

import type { Document } from "mongoose";

/** Union kept open so deposit / marketplace types can be added later. */
export type ProcessedTransactionType = "withdrawal" | "mint" | "marketplace_purchase";

/**
 * Typed metadata per transaction type.
 *
 * mint      — stores the hero ObjectIds created + the deterministic numbers
 *             assigned, so a recovery job can re-insert heroes if the worker
 *             crashed after claiming the txHash but before finishing insertMany.
 *
 * withdrawal — stores the on-chain payout txHash emitted by the treasury.
 */
export type ProcessedTransactionMetadata =
  | {
      type: "mint";
      /** Mongoose _id strings of the inserted IHero documents. */
      heroIds: string[];
      /** Sequential display numbers that were minted. */
      mintedNumbers: number[];
      /** Number of heroes requested (mirrors mintedNumbers.length for quick queries). */
      count: number;
    }
  | {
      type: "withdrawal";
      /** The Solana signature of the payout transfer to the player. */
      payoutTxHash: string;
    }
  | {
      type: "marketplace_purchase";
      /** Mongoose _id of the hero that changed hands. */
      heroId: string;
      heroName: string;
      heroRarity: string;
      sellerWallet: string;
      price: number;
      fee: number;
      sellerNet: number;
      /** On-chain signature of the treasury → seller payout. */
      payoutTxHash: string;
    };

export interface IProcessedTransaction extends Document {
  /** On-chain Solana signature (base58) for withdrawals. Unique index. */
  txHash: string;
  /** Player wallet the settlement applies to. */
  wallet: string;
  type: ProcessedTransactionType;
  /** Net coin delta for the player. Negative for withdrawals. */
  amount: number;
  /** Unix ms the settlement was recorded. */
  processedAt: number;
  /**
   * Type-specific detail stored at settlement time.
   * Optional for backwards-compatibility with rows written before this field existed.
   */
  metadata?: ProcessedTransactionMetadata;
}
