import { mockDb } from "@/features/stores/mock/database";
import { PendingTransactionDocumentSchema, TransactionMetadataSchemas } from "./server.model";
import type { PendingTransactionRepository } from "./server.types";

const now = () => new Date().toISOString();
const DEFAULT_MAX_ATTEMPTS = 3;

/** Pending transactions repository (mock store until MongoDB is wired). */
export const pendingTransactionRepository: PendingTransactionRepository = {
  async create(data) {
    if (data.transactionId) {
      const existing = mockDb.pendingTransactions.get(data.transactionId);
      if (existing) return { ...existing };
    }
    const metadata = TransactionMetadataSchemas[data.type].parse(data.metadata);
    const ts = now();
    const record = PendingTransactionDocumentSchema.parse({
      transactionId: data.transactionId ?? crypto.randomUUID(),
      playerId: data.playerId,
      walletAddress: data.walletAddress ?? null,
      type: data.type,
      status: "PENDING",
      metadata,
      attempts: 0,
      maxAttempts: data.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      claimedBy: null,
      claimedAt: null,
      lastError: null,
      createdAt: ts,
      updatedAt: ts,
    });
    mockDb.pendingTransactions.set(record.transactionId, record);
    return { ...record };
  },
  async findById(transactionId) {
    const t = mockDb.pendingTransactions.get(transactionId);
    return t ? { ...t } : null;
  },
  async claimBatch(workerId, limit) {
    const ts = now();
    const batch = [...mockDb.pendingTransactions.values()]
      .filter((t) => t.status === "PENDING")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
    for (const t of batch) {
      Object.assign(t, {
        status: "PROCESSING",
        claimedBy: workerId,
        claimedAt: ts,
        attempts: t.attempts + 1,
        updatedAt: ts,
      });
    }
    return batch.map((t) => ({ ...t }));
  },
  async release(transactionId, error) {
    const t = mockDb.pendingTransactions.get(transactionId);
    if (!t) return;
    Object.assign(t, { status: "PENDING", claimedBy: null, claimedAt: null, lastError: error, updatedAt: now() });
  },
  async remove(transactionId) {
    mockDb.pendingTransactions.delete(transactionId);
  },
};
