import { z } from "zod";
import { PendingTransactionDocumentSchema } from "@/lib/modules/transactions-pending/server.model";

/** MongoDB collection name for finished worker outcomes. */
export const PROCESSED_TRANSACTIONS_COLLECTION = "processed_transactions";

export const ProcessedTransactionStatusSchema = z.enum(["SUCCESS", "FAILED", "CANCELLED"]);

/** Final, immutable record of a worker outcome. */
export const ProcessedTransactionDocumentSchema = PendingTransactionDocumentSchema.pick({
  transactionId: true,
  playerId: true,
  walletAddress: true,
  type: true,
  metadata: true,
  attempts: true,
}).extend({
  status: ProcessedTransactionStatusSchema,
  /** Hash / signature returned by the chain. */
  onChainTxId: z.string().nullable(),
  blockNumber: z.number().int().nonnegative().nullable(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  processedBy: z.string(),
  queuedAt: z.string(),
  processedAt: z.string(),
});
export type ProcessedTransactionDocument = z.infer<typeof ProcessedTransactionDocumentSchema>;
