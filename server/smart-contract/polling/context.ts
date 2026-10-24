import { pendingTransactionRepository } from "@/lib/modules/transactions-pending/server.repository";
import { processedTransactionRepository } from "@/lib/modules/transactions-processed/server.repository";
import type { PendingTransactionRepository } from "@/lib/modules/transactions-pending/server.types";
import type { ProcessedTransactionRepository } from "@/lib/modules/transactions-processed/server.types";

/**
 * Polling context: everything the worker needs, injected.
 * The poller only talks to repositories, so it runs the same against
 * the mock store today and MongoDB later.
 */
export interface PollingContext {
  workerId: string;
  batchSize: number;
  intervalMs: number;
  maxAttempts: number;
  pending: PendingTransactionRepository;
  processed: ProcessedTransactionRepository;
}

export function createPollingContext(overrides: Partial<PollingContext> = {}): PollingContext {
  return {
    workerId: `worker-${crypto.randomUUID().slice(0, 8)}`,
    batchSize: 10,
    intervalMs: 5000,
    maxAttempts: 3,
    pending: pendingTransactionRepository,
    processed: processedTransactionRepository,
    ...overrides,
  };
}
