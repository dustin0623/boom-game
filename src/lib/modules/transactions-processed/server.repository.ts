import { mockDb } from "@/features/stores/mock/database";
import { ProcessedTransactionDocumentSchema } from "./server.model";
import type { ProcessedTransactionRepository } from "./server.types";

/** Processed transactions repository (mock store until MongoDB is wired). Keyed by transactionId. */
export const processedTransactionRepository: ProcessedTransactionRepository = {
  async create(data) {
    const record = ProcessedTransactionDocumentSchema.parse({ ...data, processedAt: new Date().toISOString() });
    mockDb.processedTransactions.set(record.transactionId, record);
    return record;
  },
  async findById(transactionId) {
    return mockDb.processedTransactions.get(transactionId) ?? null;
  },
  async findByPlayer(playerId) {
    return [...mockDb.processedTransactions.values()]
      .filter((t) => t.playerId === playerId)
      .sort((a, b) => b.processedAt.localeCompare(a.processedAt));
  },
};
