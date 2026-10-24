/**
 * lib/modules/marketplace-logs/types.server.ts
 *
 * Immutable audit record written after a marketplace purchase is fully settled.
 * One row per completed trade.
 */

import type { Document } from "mongoose";

/** Plain data shape — used as input to insertMarketplaceLog and for .lean() reads. */
export interface IMarketplaceLogData {
  /** Buyer's wallet address. */
  buyerWallet: string;
  /** Seller's wallet address (hero owner at time of listing). */
  sellerWallet: string;
  /** Mongoose _id of the hero that changed hands. */
  heroId: string;
  /** Hero display name at time of purchase (denormalized). */
  heroName: string;
  /** Hero rarity at time of purchase (denormalized). */
  heroRarity: string;
  /** Total token amount paid by buyer (whole tokens). */
  price: number;
  /** Treasury fee retained (price × 0.05). */
  fee: number;
  /** Amount sent to seller from treasury (price × 0.95). */
  sellerNet: number;
  /** On-chain txId of the buyer → treasury payment. */
  txHash: string;
  /** On-chain txId of the treasury → seller payout. */
  payoutTxHash: string;
  /** Unix ms when the settlement completed. */
  settledAt: number;
}

/** Full Mongoose document type (includes _id and document methods). */
export interface IMarketplaceLog extends IMarketplaceLogData, Document {}
