import mongoose, { Schema, Model } from "mongoose";
import type { IMarketplaceLog } from "./types.server";

export type { IMarketplaceLog } from "./types.server";

const MarketplaceLogSchema = new Schema<IMarketplaceLog>(
  {
    buyerWallet:  { type: String, required: true },
    sellerWallet: { type: String, required: true },
    heroId:       { type: String, required: true },
    heroName:     { type: String, required: true },
    heroRarity:   { type: String, required: true },
    price:        { type: Number, required: true },
    fee:          { type: Number, required: true },
    sellerNet:    { type: Number, required: true },
    txHash:       { type: String, required: true, unique: true, index: true },
    payoutTxHash: { type: String, required: true },
    settledAt:    { type: Number, required: true },
  },
  { collection: "marketplace_logs", timestamps: false },
);

// Buyer purchase history, newest-first.
MarketplaceLogSchema.index({ buyerWallet: 1, settledAt: -1 });
// Seller sales history, newest-first.
MarketplaceLogSchema.index({ sellerWallet: 1, settledAt: -1 });

export const MarketplaceLogModel: Model<IMarketplaceLog> =
  mongoose.models.MarketplaceLog ??
  mongoose.model<IMarketplaceLog>("MarketplaceLog", MarketplaceLogSchema);
