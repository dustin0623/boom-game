import type { PendingTransactionDocument } from "@/lib/modules/transactions-pending/server.model";
import type { PollingContext } from "./context";

export type HandlerResult =
  | { ok: true; onChainTxId: string | null; blockNumber?: number | null; data?: unknown }
  | { ok: false; error: string; retryable?: boolean };
export type TransactionHandler = (tx: PendingTransactionDocument) => Promise<HandlerResult>;

/** One poll cycle: claim a batch, run the handler, record every outcome. */
export async function pollOnce(ctx: PollingContext, handle: TransactionHandler) {
  const batch = await ctx.pending.claimBatch(ctx.workerId, ctx.batchSize);
  for (const tx of batch) {
    let result: HandlerResult;
    try {
      result = await handle(tx);
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const limit = Math.min(tx.maxAttempts, ctx.maxAttempts);
    if (!result.ok && result.retryable !== false && tx.attempts < limit) {
      await ctx.pending.release(tx.transactionId, result.error);
      continue;
    }
    await ctx.processed.create({
      transactionId: tx.transactionId,
      playerId: tx.playerId,
      walletAddress: tx.walletAddress,
      type: tx.type,
      metadata: tx.metadata,
      attempts: tx.attempts,
      status: result.ok ? "SUCCESS" : "FAILED",
      onChainTxId: result.ok ? result.onChainTxId : null,
      blockNumber: result.ok ? (result.blockNumber ?? null) : null,
      result: result.ok ? (result.data ?? null) : null,
      error: result.ok ? null : result.error,
      processedBy: ctx.workerId,
      queuedAt: tx.createdAt,
    });
    await ctx.pending.remove(tx.transactionId);
  }
  return batch.length;
}

/** Start polling on an interval; returns a stop function. */
export function startPolling(ctx: PollingContext, handle: TransactionHandler) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(ctx, handle);
    } finally {
      running = false;
    }
  }, ctx.intervalMs);
  return () => clearInterval(timer);
}
