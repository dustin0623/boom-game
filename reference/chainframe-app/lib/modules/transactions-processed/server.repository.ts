// src/lib/modules/transactions-processed/repository.server.ts
import { ProcessedTransactionModel } from "./server.model";
import type {
  IProcessedTransaction,
  ProcessedTxType,
  ProcessedTxMetadata,
  AnalyticsReceipt,
} from "./server.types";
import { connectDatabase } from "@/lib/config/database";
import { isDeepStrictEqual } from "node:util";
import { RaidEvidenceConflict } from "@/features/types/game/raid-settlement";
import type { MarketFeeObligation } from "@/lib/modules/transactions-pending/server.types";

/** Exact successful identities only; no blockchain lookup or pending-job inference. */
export async function readAnalyticsReceipts(
  keys: string[],
  asOf: number,
): Promise<AnalyticsReceipt[]> {
  if (keys.length > 250)
    throw new Error("Analytics receipt batch exceeds limit");
  if (!keys.length) return [];
  await connectDatabase();
  const rows = await ProcessedTransactionModel.find({
    txHash: { $in: keys },
    status: "success",
    processedAt: { $lte: asOf },
  })
    .select({
      txHash: 1,
      wallet: 1,
      type: 1,
      "metadata.type": 1,
      "metadata.event.status": 1,
      "metadata.event.eventKey": 1,
      "metadata.event.operationIndex": 1,
      "metadata.event.event.action": 1,
      "metadata.event.event.metadata.equipmentId": 1,
      "metadata.paymentOperationIndex": 1,
      "metadata.currency": 1,
      "metadata.shopKind": 1,
      "metadata.payoutTxHash": 1,
    })
    .maxTimeMS(5000)
    .lean();
  return rows.flatMap<AnalyticsReceipt>((row) => {
    const metadata = row.metadata;
    if (metadata?.type !== row.type) return [];
    if (row.type === "game_action") {
      if (
        metadata?.type !== "game_action" ||
        metadata.event.status !== "processed" ||
        metadata.event.eventKey !== row.txHash
      )
        return [];
      return [
        {
          key: row.txHash,
          wallet: row.wallet,
          type: row.type,
          action: metadata.event.event?.action,
          operationIndex: metadata.event.operationIndex,
          itemId:
            typeof metadata.event.event?.metadata?.equipmentId === "string"
              ? metadata.event.event.metadata.equipmentId
              : undefined,
        },
      ];
    }
    if (metadata.type === "withdrawal" && !metadata.payoutTxHash) return [];
    return [
      {
        key: row.txHash,
        wallet: row.wallet,
        type: row.type,
        operationIndex: metadata?.paymentOperationIndex,
        ...(metadata?.type === "market_purchase"
          ? { currency: metadata.currency, itemId: metadata.itemId }
          : {}),
        ...(metadata?.type === "shop_purchase"
          ? { shopKind: metadata.shopKind }
          : {}),
      },
    ];
  });
}

function isDuplicate(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

export async function insertProcessedTransaction(input: {
  txHash: string;
  wallet: string;
  type: ProcessedTxType;
  amount: number;
  metadata?: ProcessedTxMetadata;
}): Promise<void> {
  await connectDatabase();
  try {
    await ProcessedTransactionModel.create({
      txHash: input.txHash,
      wallet: input.wallet,
      type: input.type,
      amount: input.amount,
      processedAt: Date.now(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  } catch (err) {
    if (isDuplicate(err)) return;
    throw err;
  }
}

/**
 * Records a permanently dead-lettered pending job as a "failed" outcome.
 * Called right before the job is removed from transactions-pending so every
 * pending document is either still in-flight (pending/failed-retrying) or
 * has a terminal record here — never stale/orphaned once settlement ends.
 * Idempotent on txHash like the other insert helpers.
 */
export async function recordFailedTransaction(input: {
  txHash: string;
  wallet: string;
  type: ProcessedTxType;
  amount: number;
  error: string;
  metadata?: ProcessedTxMetadata;
}): Promise<void> {
  await connectDatabase();
  try {
    await ProcessedTransactionModel.create({
      txHash: input.txHash,
      wallet: input.wallet,
      type: input.type,
      amount: input.amount,
      status: "failed",
      error: input.error.slice(0, 500),
      processedAt: Date.now(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  } catch (err) {
    if (isDuplicate(err)) return;
    throw err;
  }
}

export async function claimProcessedTransaction(input: {
  txHash: string;
  wallet: string;
  type: ProcessedTxType;
  amount: number;
  metadata?: ProcessedTxMetadata;
}): Promise<{ claimed: boolean }> {
  await connectDatabase();
  try {
    await ProcessedTransactionModel.create({
      txHash: input.txHash,
      wallet: input.wallet,
      type: input.type,
      amount: input.amount,
      processedAt: Date.now(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    return { claimed: true };
  } catch (err) {
    if (isDuplicate(err)) return { claimed: false };
    throw err;
  }
}

export async function isTransactionProcessed(txHash: string): Promise<boolean> {
  await connectDatabase();
  const count = await ProcessedTransactionModel.countDocuments({
    txHash,
  }).limit(1);
  return count > 0;
}

export async function hasRegistrationReceipt(wallet: string): Promise<boolean> {
  await connectDatabase();
  return !!(await ProcessedTransactionModel.exists({
    wallet,
    type: "registration",
  }));
}

export async function getProcessedTransaction(
  txHash: string,
): Promise<IProcessedTransaction | null> {
  await connectDatabase();
  return ProcessedTransactionModel.findOne({
    txHash,
  }).lean<IProcessedTransaction>();
}

import type {
  GameEventRecord,
  TreasuryTransfer,
} from "@/lib/modules/transactions-pending/server.types";
export async function getProcessedGameEvent(
  eventKey: string,
): Promise<GameEventRecord | null> {
  await connectDatabase();
  const receipt = await ProcessedTransactionModel.findOne({
    txHash: eventKey,
    type: "game_action",
  }).lean();
  return receipt?.metadata?.type === "game_action"
    ? receipt.metadata.event
    : null;
}
export async function findProcessedGameNonce(
  actor: string,
  nonce: string,
  exceptKey: string,
): Promise<GameEventRecord | null> {
  await connectDatabase();
  const receipt = await ProcessedTransactionModel.findOne({
    type: "game_action",
    txHash: { $ne: exceptKey },
    "metadata.event.actor": actor,
    "metadata.event.nonce": nonce,
  }).lean();
  return receipt?.metadata?.type === "game_action"
    ? receipt.metadata.event
    : null;
}
export async function insertGameReceipt(event: GameEventRecord) {
  await connectDatabase();
  try {
    await ProcessedTransactionModel.create({
      txHash: event.eventKey,
      wallet: event.actor || "unknown",
      type: "game_action",
      amount: 0,
      processedAt: event.updatedAt,
      status: event.status === "processed" ? "success" : "failed",
      error: event.reason,
      metadata: { type: "game_action", event },
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const existing = await getProcessedGameEvent(event.eventKey);
    // Retry timestamps/claims are incidental. Identity, inputs and outcome must agree.
    const evidence = (value: GameEventRecord | null) =>
      value && {
        eventKey: value.eventKey,
        event: value.event,
        nonce: value.nonce,
        randomSeed: value.randomSeed,
        status: value.status,
        reason: value.reason,
        result: value.result,
        raidSettlement: value.raidSettlement,
      };
    if (!isDeepStrictEqual(evidence(existing), evidence(event)))
      throw new RaidEvidenceConflict("Conflicting gameplay receipt", error);
  }
}

import { encodeCursor } from "@/lib/utils/logs/history";
import { publicTransactionMetadata } from "@/lib/utils/logs/transaction-metadata";
import type { HistoryOptions } from "@/lib/utils/logs/history";
export async function listProcessedHistory(
  wallet: string,
  options: HistoryOptions,
) {
  await connectDatabase();
  const direction = options.direction === "newer" ? 1 : -1;
  const operator = direction === 1 ? "$gt" : "$lt";
  const rows = await ProcessedTransactionModel.find({
    wallet,
    ...(options.cursor
      ? {
          $or: [
            { processedAt: { [operator]: options.cursor.time } },
            {
              processedAt: options.cursor.time,
              _id: { [operator]: options.cursor.id },
            },
          ],
        }
      : {}),
  })
    .sort({ processedAt: direction, _id: direction })
    .limit(options.limit + 1)
    .lean();
  const history = rows.slice(0, options.limit).map((tx) => ({
    id: String(tx._id),
    type: tx.type,
    txHash: tx.txHash,
    amount: tx.amount,
    status: tx.status ?? "success",
    error: tx.error ?? null,
    processedAt: tx.processedAt,
    transactionId:
      tx.type === "game_action"
        ? (tx.metadata as unknown as { event: { transactionId: string } }).event
            .transactionId
        : tx.txHash,
    operationIndex:
      tx.type === "game_action"
        ? (tx.metadata as unknown as { event: { operationIndex: number } })
            .event.operationIndex
        : ((tx.metadata as unknown as { paymentOperationIndex?: number })
            ?.paymentOperationIndex ?? 0),
    metadata: publicTransactionMetadata(
      tx.metadata as unknown as Record<string, unknown>,
    ),
  }));
  const last = history.at(-1);
  const newest = direction === 1 ? last : history[0];
  const cursor = (tx: typeof last) =>
    tx ? encodeCursor({ time: tx.processedAt, id: tx.id }) : null;
  return {
    history,
    nextCursor: rows.length > options.limit ? cursor(last) : null,
    latestCursor: cursor(newest),
  };
}

export async function getArchivedTreasuryTransfer(
  key: string,
): Promise<TreasuryTransfer | null> {
  await connectDatabase();
  const receipt = await ProcessedTransactionModel.findOne(
    { "metadata.treasuryTransfers.key": key },
    { metadata: 1 },
  ).lean();
  return (
    receipt?.metadata?.treasuryTransfers?.find((t) => t.key === key) ?? null
  );
}
export async function archiveTreasuryTransfers(
  txHash: string,
  transfers: TreasuryTransfer[],
  referralObligation?: import("@/lib/modules/transactions-pending/server.types").ReferralObligation,
): Promise<void> {
  await connectDatabase();
  const result = await ProcessedTransactionModel.updateOne(
    { txHash },
    {
      $set: {
        "metadata.treasuryTransfers": transfers,
        ...(referralObligation
          ? { "metadata.referralObligation": referralObligation }
          : {}),
      },
    },
  );
  if (!result.matchedCount)
    throw new Error(
      "Cannot archive treasury transfers without a processed receipt",
    );
}

/** A completed sale's follow-up cannot overwrite a different obligation or regress paid status. */
export async function archiveMarketFeeSettlement(
  txHash: string,
  obligation: MarketFeeObligation,
  status: "pending" | "paid" | "not_due",
  transfers: TreasuryTransfer[],
): Promise<void> {
  await connectDatabase();
  const sameObligation = Object.fromEntries(
    Object.entries(obligation).map(([key, value]) => [
      `metadata.marketFeeObligation.${key}`,
      value,
    ]),
  );
  const result = await ProcessedTransactionModel.updateOne(
    {
      txHash,
      wallet: obligation.buyer,
      type: "market_purchase",
      status: "success",
      "metadata.marketFeePolicyVersion": 1,
      $and: [
        {
          $or: [
            { "metadata.marketFeeObligation": { $exists: false } },
            sameObligation,
          ],
        },
        {
          $or: [
            { "metadata.marketFeeStatus": { $exists: false } },
            { "metadata.marketFeeStatus": "pending" },
            { "metadata.marketFeeStatus": status },
          ],
        },
      ],
    },
    {
      $set: {
        "metadata.marketFeeObligation": obligation,
        "metadata.marketFeeStatus": status,
        "metadata.treasuryTransfers": transfers,
      },
    },
  );
  if (!result.matchedCount)
    throw new Error("Marketplace fee receipt evidence changed");
}
