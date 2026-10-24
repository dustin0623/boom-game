import type { ProcessedTransactionDocument } from "./server.model";

export type CreateProcessedTransactionInput = Omit<ProcessedTransactionDocument, "processedAt">;

export interface ProcessedTransactionRepository {
  create(data: CreateProcessedTransactionInput): Promise<ProcessedTransactionDocument>;
  findById(transactionId: string): Promise<ProcessedTransactionDocument | null>;
  findByPlayer(playerId: string): Promise<ProcessedTransactionDocument[]>;
}
