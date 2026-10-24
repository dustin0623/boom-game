import mongoose, { Schema, Model } from "mongoose";
import type { IProcessedTransaction } from "./types.server";

export type { IProcessedTransaction } from "./types.server";

const ProcessedTransactionSchema = new Schema<IProcessedTransaction>(
  {
    /** On-chain signature — unique idempotency guard for the ledger. */
    txHash:      { type: String, required: true, unique: true, index: true },
    wallet:      { type: String, required: true },
    type:        { type: String, required: true, enum: ["withdrawal", "mint", "marketplace_purchase"], default: "withdrawal" },
    amount:      { type: Number, required: true },
    processedAt: { type: Number, required: true },
    /**
     * Type-specific detail. Stored as a flexible Mixed field so each
     * transaction type can carry its own shape without sub-schemas.
     * Optional — rows written before this field existed have metadata=undefined.
     */
    metadata:    { type: Schema.Types.Mixed },
  },
  { collection: "transactions_processed" },
);

// Per-player history, newest-first.
ProcessedTransactionSchema.index({ wallet: 1, processedAt: -1 });

export const ProcessedTransactionModel: Model<IProcessedTransaction> =
  mongoose.models.ProcessedTransaction ??
  mongoose.model<IProcessedTransaction>("ProcessedTransaction", ProcessedTransactionSchema);
