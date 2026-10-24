import mongoose, { Schema, Model } from "mongoose";
import type { IInboundTransaction } from "./types.server";

export type { IInboundTransaction } from "./types.server";

const InboundTransactionSchema = new Schema<IInboundTransaction>(
  {
    type: {
      type: String,
      required: true,
      enum: ["withdrawal", "mint", "marketplace_purchase"],
      default: "withdrawal",
    },
    /** Idempotency key — unique across the queue (mint = on-chain txId). */
    signature: { type: String, required: true, unique: true, index: true },

    walletAddress: { type: String, required: true },

    // withdrawal-only
    withdrawAmount: {
      type: Number,
      required: function (this: IInboundTransaction) {
        return this.type === "withdrawal";
      },
    },

    // mint-only
    mintCount: {
      type: Number,
      required: function (this: IInboundTransaction) {
        return this.type === "mint";
      },
    },
    mintedNumbers: {
      type: [Number],
      required: function (this: IInboundTransaction) {
        return this.type === "mint";
      },
    },

    // marketplace_purchase-only
    buyerWallet:   { type: String },
    sellerWallet:  { type: String },
    heroId:        { type: String },
    heroName:      { type: String },
    heroRarity:    { type: String },
    purchasePrice: { type: Number },

    status: {
      type: String,
      required: true,
      enum: ["pending", "failed", "dead"],
      default: "pending",
    },
    retryCount: { type: Number, default: 0 },
    lastError:  { type: String },
  },
  { collection: "transactions_pending", timestamps: true },
);

// Drain index — worker queries { status: { $in: ["pending","failed"] } } oldest-first.
InboundTransactionSchema.index({ status: 1, createdAt: 1 });

export const InboundTransactionModel: Model<IInboundTransaction> =
  mongoose.models.InboundTransaction ??
  mongoose.model<IInboundTransaction>("InboundTransaction", InboundTransactionSchema);
