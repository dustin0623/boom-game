import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Dev trigger for the unified worker: runs one poll cycle in-process.
 * Only active in mock mode (no MONGODB_URI); live mode uses a real worker process.
 */
export const runTransactionBatch = createServerFn({ method: "POST" }).handler(async () => {
  const { getDatabaseMode } = await import("@/lib/config/database");
  if (getDatabaseMode() !== "mock") return { processed: 0, skipped: true };
  const { createPollingContext } = await import("../../../server/smart-contract/polling/context");
  const { pollOnce } = await import("../../../server/smart-contract/polling/transaction-poller");
  const { createProcessor, liveRegistry, mockSuccess } = await import("../../../server/smart-contract/processor");
  const processed = await pollOnce(createPollingContext({ workerId: "dev-worker" }), createProcessor(liveRegistry, mockSuccess));
  return { processed, skipped: false };
});

/** Status of a queued transaction: PENDING / PROCESSING / SUCCESS / FAILED / CANCELLED. */
export const getTransactionStatus = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ transactionId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { pendingTransactionRepository } = await import("@/lib/modules/transactions-pending/server.repository");
    const { processedTransactionRepository } = await import("@/lib/modules/transactions-processed/server.repository");
    const pending = await pendingTransactionRepository.findById(data.transactionId);
    if (pending) return { status: pending.status, type: pending.type, onChainTxId: null, error: pending.lastError };
    const done = await processedTransactionRepository.findById(data.transactionId);
    if (done) return { status: done.status, type: done.type, onChainTxId: done.onChainTxId, error: done.error };
    return { status: "UNKNOWN" as const, type: null, onChainTxId: null, error: null };
  });
