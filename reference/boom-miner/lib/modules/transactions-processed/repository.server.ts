/**
 * lib/modules/transactions-processed/repository.server.ts
 *
 * Data-access surface for the permanent settlement ledger.
 *
 * SERVER-ONLY.
 */

import { ProcessedTransactionModel } from "./model.server";
import type {
  IProcessedTransaction,
  ProcessedTransactionType,
  ProcessedTransactionMetadata,
} from "./types.server";
import { connectDatabase } from "@/lib/config/database";

export type { IProcessedTransaction } from "./types.server";

/**
 * Inserts a ledger row. The unique `txHash` index makes replays a no-op:
 * a duplicate key error (E11000) is swallowed and treated as "already recorded".
 */
export async function insertProcessedTransaction(input: {
  txHash: string;
  wallet: string;
  type: ProcessedTransactionType;
  amount: number;
  metadata?: ProcessedTransactionMetadata;
}): Promise<void> {
  await connectDatabase();
  try {
    await ProcessedTransactionModel.create({
      txHash:      input.txHash,
      wallet:      input.wallet,
      type:        input.type,
      amount:      input.amount,
      processedAt: Date.now(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  } catch (err: unknown) {
    // Duplicate txHash — ledger already has this settlement. Idempotent no-op.
    if (isDuplicateKeyError(err)) return;
    throw err;
  }
}

/**
 * Atomically claims a settlement by inserting its ledger row.
 *
 * Unlike insertProcessedTransaction (which silently swallows duplicates), this
 * reports whether THIS call created the row. Because `txHash` is uniquely
 * indexed, exactly one concurrent caller can ever get `claimed: true` for a
 * given signature — making it a safe idempotency gate for actions that must
 * run at most once per on-chain transaction (e.g. minting heroes).
 *
 * Pass `metadata` to attach type-specific detail (hero IDs for mints, payout
 * txHash for withdrawals) so the ledger is self-contained and a recovery job
 * can re-insert heroes from it if the worker crashed mid-mint.
 */
export async function claimProcessedTransaction(input: {
  txHash: string;
  wallet: string;
  type: ProcessedTransactionType;
  amount: number;
  metadata?: ProcessedTransactionMetadata;
}): Promise<{ claimed: boolean }> {
  await connectDatabase();
  try {
    await ProcessedTransactionModel.create({
      txHash:      input.txHash,
      wallet:      input.wallet,
      type:        input.type,
      amount:      input.amount,
      processedAt: Date.now(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    return { claimed: true };
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) return { claimed: false };
    throw err;
  }
}

/**
 * Patches the `metadata` field on an existing ledger row identified by `txHash`.
 * Used by the mint worker to write hero IDs back after `insertMany` succeeds,
 * in case they couldn't be supplied at claim time.
 */
export async function patchTransactionMetadata(
  txHash: string,
  metadata: ProcessedTransactionMetadata,
): Promise<void> {
  await connectDatabase();
  await ProcessedTransactionModel.updateOne({ txHash }, { $set: { metadata } });
}

export async function findProcessedTransaction(
  txHash: string,
): Promise<IProcessedTransaction | null> {
  await connectDatabase();
  return ProcessedTransactionModel.findOne({ txHash }).lean<IProcessedTransaction | null>();
}

export async function isTransactionProcessed(txHash: string): Promise<boolean> {
  await connectDatabase();
  const count = await ProcessedTransactionModel.countDocuments({ txHash }).limit(1);
  return count > 0;
}

/**
 * Keyset-paginated history for a wallet, newest-first.
 * `cursor` is the `processedAt` of the last item from the previous page.
 */
export async function getTransactionHistory(
  wallet: string,
  limit: number,
  cursor?: number,
  type?: ProcessedTransactionType,
): Promise<{ transactions: IProcessedTransaction[]; nextCursor: number | null }> {
  await connectDatabase();

  const filter: Record<string, unknown> = { wallet };
  if (type) filter.type = type;
  if (cursor != null) filter.processedAt = { $lt: cursor };

  // Fetch one extra to determine whether another page exists.
  const rows = await ProcessedTransactionModel.find(filter)
    .sort({ processedAt: -1 })
    .limit(limit + 1)
    .lean<IProcessedTransaction[]>();

  const hasMore = rows.length > limit;
  const transactions = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? transactions[transactions.length - 1].processedAt : null;

  return { transactions, nextCursor };
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}
