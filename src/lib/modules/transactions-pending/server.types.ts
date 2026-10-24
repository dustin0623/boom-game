import type { PendingTransactionDocument, TransactionMetadata, TransactionType } from "./server.model";

export type CreatePendingTransactionInput<T extends TransactionType = TransactionType> = {
  type: T;
  playerId: string;
  walletAddress?: string | null;
  metadata: TransactionMetadata<T>;
  /** Optional client-supplied idempotency key; generated when omitted. */
  transactionId?: string;
  maxAttempts?: number;
};

export interface PendingTransactionRepository {
  /** Validates metadata against the type's template. Same transactionId returns the existing row. */
  create<T extends TransactionType>(data: CreatePendingTransactionInput<T>): Promise<PendingTransactionDocument>;
  findById(transactionId: string): Promise<PendingTransactionDocument | null>;
  /** Atomically claim up to `limit` PENDING rows (oldest first) for a worker. */
  claimBatch(workerId: string, limit: number): Promise<PendingTransactionDocument[]>;
  /** Return a claimed row to PENDING after a retryable failure. */
  release(transactionId: string, error: string): Promise<void>;
  /** Remove a row once its outcome is stored in transactions-processed. */
  remove(transactionId: string): Promise<void>;
}
