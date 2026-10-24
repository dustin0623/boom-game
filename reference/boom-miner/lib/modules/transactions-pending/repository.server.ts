/**
 * lib/modules/transactions-pending/repository.server.ts
 *
 * Data-access surface for the durable withdrawal queue.
 * Imported by BOTH the Next.js API route (enqueue) and the sidecar worker
 * (drain / complete / fail).
 *
 * SERVER-ONLY.
 */

import { randomUUID } from "crypto";
import { InboundTransactionModel } from "./model.server";
import type { IInboundTransaction, InboundTxStatus } from "./types.server";
import { connectDatabase } from "@/lib/config/database";

export type { IInboundTransaction } from "./types.server";

/** Default max retries before a job is dead-lettered. */
const DEFAULT_MAX_RETRIES = 8;

/**
 * Enqueues a withdrawal. Generates a UUID `signature` as the idempotency key.
 * Returns the created row's id + signature.
 */
export async function enqueueWithdrawal(input: {
  walletAddress: string;
  withdrawAmount: number;
}): Promise<{ jobId: string; signature: string }> {
  await connectDatabase();
  const signature = randomUUID();
  const doc = await InboundTransactionModel.create({
    type: "withdrawal",
    signature,
    walletAddress: input.walletAddress,
    withdrawAmount: input.withdrawAmount,
    status: "pending",
    retryCount: 0,
  });
  return { jobId: String(doc._id), signature };
}

/**
 * Enqueues a mint. The idempotency key (`signature`) is the on-chain transfer
 * signature (`txId`) the player signed to pay the treasury. If the same txId is
 * enqueued twice, the unique index rejects it and we return `duplicate: true`
 * so the route can respond idempotently instead of throwing.
 */
export async function enqueueMint(input: {
  walletAddress: string;
  txId: string;
  count: number;
  mintedNumbers: number[];
}): Promise<{ jobId: string; signature: string; duplicate: boolean }> {
  await connectDatabase();
  try {
    const doc = await InboundTransactionModel.create({
      type: "mint",
      signature: input.txId,
      walletAddress: input.walletAddress,
      mintCount: input.count,
      mintedNumbers: input.mintedNumbers,
      status: "pending",
      retryCount: 0,
    });
    return { jobId: String(doc._id), signature: input.txId, duplicate: false };
  } catch (err: unknown) {
    // E11000 duplicate key → this txId is already queued/processed. Idempotent.
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) {
      const existing = await InboundTransactionModel.findOne({ signature: input.txId })
        .select("_id")
        .lean<{ _id: unknown }>();
      return {
        jobId: existing ? String(existing._id) : input.txId,
        signature: input.txId,
        duplicate: true,
      };
    }
    throw err;
  }
}

/**
 * Enqueues a marketplace purchase. The idempotency key (`signature`) is the
 * on-chain transfer txId the buyer signed to pay the treasury. Duplicate
 * submissions return `duplicate: true` so the route can respond idempotently.
 */
export async function enqueueMarketplacePurchase(input: {
  buyerWallet:  string;
  sellerWallet: string;
  heroId:       string;
  heroName:     string;
  heroRarity:   string;
  price:        number;
  txId:         string;
}): Promise<{ jobId: string; signature: string; duplicate: boolean }> {
  await connectDatabase();
  try {
    const doc = await InboundTransactionModel.create({
      type:          "marketplace_purchase",
      signature:     input.txId,
      walletAddress: input.buyerWallet,
      buyerWallet:   input.buyerWallet,
      sellerWallet:  input.sellerWallet,
      heroId:        input.heroId,
      heroName:      input.heroName,
      heroRarity:    input.heroRarity,
      purchasePrice: input.price,
      status:        "pending",
      retryCount:    0,
    });
    return { jobId: String(doc._id), signature: input.txId, duplicate: false };
  } catch (err: unknown) {
    // E11000 duplicate key → this txId was already queued/processed. Idempotent.
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) {
      const existing = await InboundTransactionModel.findOne({ signature: input.txId })
        .select("_id")
        .lean<{ _id: unknown }>();
      return {
        jobId:     existing ? String(existing._id) : input.txId,
        signature: input.txId,
        duplicate: true,
      };
    }
    throw err;
  }
}

/**
 * Snapshot of drainable jobs (pending or previously failed), oldest-first.
 * `limit = 0` means no limit.
 */
export async function listPendingOldestFirst(
  limit = 0,
): Promise<IInboundTransaction[]> {
  await connectDatabase();
  const query = InboundTransactionModel.find({
    status: { $in: ["pending", "failed"] satisfies InboundTxStatus[] },
  }).sort({ createdAt: 1 });
  if (limit > 0) query.limit(limit);
  return query.exec();
}

/** Deletes a job on terminal success. */
export async function completeJob(id: string): Promise<void> {
  await connectDatabase();
  await InboundTransactionModel.deleteOne({ _id: id });
}

/**
 * Records a failure: increments retryCount, stores the error, and flips the
 * row to `dead` once `maxRetries` is exceeded.
 * Returns `true` when the job was dead-lettered.
 */
export async function failJob(
  id: string,
  message: string,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<boolean> {
  await connectDatabase();
  const doc = await InboundTransactionModel.findById(id);
  if (!doc) return false;

  doc.retryCount += 1;
  doc.lastError = message.slice(0, 500);
  const deadLettered = doc.retryCount >= maxRetries;
  doc.status = deadLettered ? "dead" : "failed";
  await doc.save();
  return deadLettered;
}

/** Counts jobs grouped by status — used for boot/heartbeat logging. */
export async function countJobsByStatus(): Promise<Record<string, number>> {
  await connectDatabase();
  const rows = await InboundTransactionModel.aggregate<{ _id: string; n: number }>([
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r._id] = r.n;
    return acc;
  }, {});
}
