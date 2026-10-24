// src/lib/modules/transactions-processed/model.server.ts
import mongoose, { Schema, Model } from "mongoose";
import type { IProcessedTransaction } from "./server.types";

const ProcessedTransactionSchema = new Schema<IProcessedTransaction>(
  {
    txHash: { type: String, required: true, unique: true, index: true },
    wallet: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        "withdrawal",
        "deposit",
        "market_purchase",
        "registration",
        "shop_purchase",
        "game_action",
      ],
    },
    amount: { type: Number, required: true },
    processedAt: { type: Number, required: true },
    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success",
    },
    error: String,
    metadata: { type: Schema.Types.Mixed },
  },
  // Empty objects are part of immutable raid evidence, including empty effect summaries.
  { collection: "transactions-processed", minimize: false },
);

ProcessedTransactionSchema.index({ "metadata.treasuryTransfers.key": 1 });
ProcessedTransactionSchema.index({ wallet: 1, processedAt: -1, _id: -1 });
ProcessedTransactionSchema.index({ type: 1, processedAt: -1 });
ProcessedTransactionSchema.index({ status: 1, processedAt: -1 });

export const ProcessedTransactionModel: Model<IProcessedTransaction> =
  mongoose.models["ProcessedTransaction"] ??
  mongoose.model<IProcessedTransaction>(
    "ProcessedTransaction",
    ProcessedTransactionSchema,
  );
