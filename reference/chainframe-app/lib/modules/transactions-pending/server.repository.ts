// src/lib/modules/transactions-pending/repository.server.ts
import {
  gameActionNow,
  gameActionSeed,
} from "@/lib/utils/game/execution-context.server";
import { randomUUID } from "crypto";
import { InboundTransactionModel } from "./server.model";
import type {
  IInboundTransaction,
  InboundTxStatus,
  GameEventRecord,
  TreasuryIntent,
  TreasuryTransfer,
  ReferralObligation,
  MarketFeeObligation,
} from "./server.types";
import { connectDatabase } from "@/lib/config/database";

const DEFAULT_MAX_RETRIES = 8;

/** Unusual multi-payment transactions are held without crediting or rebroadcasting. */
export async function enqueuePaymentReconciliation(input: {
  transactionId: string;
  walletAddress: string;
  paymentOperationIndex?: number;
  reason: string;
}): Promise<void> {
  await connectDatabase();
  try {
    await InboundTransactionModel.create({
      type: "deposit",
      signature: input.transactionId,
      walletAddress: input.walletAddress,
      paymentOperationIndex: input.paymentOperationIndex,
      status: "reconciliation",
      lastError: input.reason,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

export async function enqueueWithdrawal(input: {
  signature: string;
  paymentOperationIndex?: number;
  walletAddress: string;
  withdrawAmount: number;
  originEventKey: string;
}): Promise<{ jobId: string; signature: string }> {
  await connectDatabase();
  if (!input.signature || !input.originEventKey)
    throw new Error("Missing withdrawal operation identity");
  const signature = input.signature;
  const values = {
    type: "withdrawal",
    signature,
    paymentOperationIndex: input.paymentOperationIndex,
    walletAddress: input.walletAddress,
    withdrawAmount: input.withdrawAmount,
    eventTime: gameActionNow(),
    randomSeed: gameActionSeed() ?? randomUUID(),
    status: "pending",
    retryCount: 0,
    originEventKey: input.originEventKey,
    financialWorkflowVersion: 1,
    withdrawalPayoutPolicyVersion: 1,
    financialPhase: "prepared",
  };
  let doc;
  try {
    doc = await InboundTransactionModel.findOneAndUpdate(
      { signature },
      { $setOnInsert: values },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await InboundTransactionModel.findOne({ signature });
  }
  if (
    !doc ||
    doc.type !== "withdrawal" ||
    doc.financialWorkflowVersion !== 1 ||
    (doc.withdrawalPayoutPolicyVersion !== undefined &&
      doc.withdrawalPayoutPolicyVersion !== 1) ||
    !["prepared", "reserved", "rejected", "refund"].includes(
      doc.financialPhase ?? "",
    ) ||
    doc.walletAddress !== input.walletAddress ||
    doc.withdrawAmount !== input.withdrawAmount ||
    doc.originEventKey !== input.originEventKey
  )
    throw new Error("Withdrawal job intent changed");
  return { jobId: String(doc._id), signature };
}

export async function setFinancialPhase(
  signature: string,
  phase: NonNullable<IInboundTransaction["financialPhase"]>,
  reason?: string,
) {
  await connectDatabase();
  const allowed: NonNullable<IInboundTransaction["financialPhase"]>[] =
    phase === "reserved" || phase === "rejected"
      ? ["prepared", phase]
      : ["prepared", "reserved", "refund"];
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      financialWorkflowVersion: 1,
      $or: [
        { type: "withdrawal", financialPhase: { $in: allowed } },
        ...(phase === "refund"
          ? [
              {
                type: "market_purchase" as const,
                $or: [
                  { financialPhase: { $exists: false } },
                  { financialPhase: "refund" as const },
                ],
              },
            ]
          : []),
      ],
    },
    {
      $set: {
        financialPhase: phase,
        ...(reason ? { financialReason: reason } : {}),
      },
    },
  );
  if (!result.matchedCount)
    throw new Error("Financial phase changed or job completed");
}

export async function markRecoverableFinancialJob(signature: string) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    { signature, databaseEffectsStarted: { $ne: true } },
    { $set: { financialWorkflowVersion: 1 } },
  );
}

export async function submitTreasuryTransfer(
  signature: string,
  key: string,
  transactionId: string,
) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      treasuryTransfers: {
        $elemMatch: {
          key,
          state: "broadcasting",
          transactionId: { $exists: false },
        },
      },
    },
    {
      $set: {
        "treasuryTransfers.$.state": "submitted",
        "treasuryTransfers.$.transactionId": transactionId,
      },
    },
  );
  if (!result.matchedCount) throw new Error("Missing treasury broadcast claim");
}

export async function recordTreasuryVerification(
  signature: string,
  key: string,
  transactionId: string,
  evidence: {
    state: "confirmed" | "failed";
    blockNumber: number;
    operationIndex: number;
    error?: string;
  },
) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      treasuryTransfers: {
        $elemMatch: {
          key,
          $and: [
            {
              $or: [
                { transactionId },
                { state: "broadcasting", transactionId: { $exists: false } },
              ],
            },
            {
              $or: [
                { verifiedAt: { $exists: false } },
                {
                  state: evidence.state,
                  operationIndex: evidence.operationIndex,
                  blockNumber: evidence.blockNumber,
                },
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        "treasuryTransfers.$.transactionId": transactionId,
        "treasuryTransfers.$.state": evidence.state,
        "treasuryTransfers.$.verifiedAt": Date.now(),
        "treasuryTransfers.$.blockNumber": evidence.blockNumber,
        "treasuryTransfers.$.operationIndex": evidence.operationIndex,
        ...(evidence.error
          ? { "treasuryTransfers.$.error": evidence.error }
          : {}),
      },
    },
  );
  if (!result.matchedCount)
    throw new Error("Treasury verification identity changed");
}

export async function enqueueDeposit(input: {
  paymentOperationIndex?: number;
  walletAddress: string;
  depositAmount: number;
  depositTxId: string;
}): Promise<{ jobId: string; duplicate: boolean }> {
  await connectDatabase();
  try {
    const doc = await InboundTransactionModel.create({
      type: "deposit",
      signature: input.depositTxId,
      paymentOperationIndex: input.paymentOperationIndex,
      walletAddress: input.walletAddress,
      depositAmount: input.depositAmount,
      depositTxId: input.depositTxId,
      eventTime: gameActionNow(),
      randomSeed: gameActionSeed() ?? randomUUID(),
      status: "pending",
      retryCount: 0,
    });
    return { jobId: String(doc._id), duplicate: false };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000)
      return { jobId: "", duplicate: true };
    throw err;
  }
}

/**
 * Marketplace purchases are paid on-chain, so the payment signature is the
 * queue's idempotency key — the same transfer can never settle twice.
 */
export async function enqueueMarketPurchase(input: {
  paymentCurrency: "HIVE";
  paymentAccount: string;
  feeTreasuryAccount: string;
  paymentOperationIndex?: number;
  walletAddress: string;
  itemId: string;
  itemType: string;
  price: number;
  paymentTxId: string;
}): Promise<{ jobId: string; signature: string; duplicate: boolean }> {
  await connectDatabase();
  try {
    const doc = await InboundTransactionModel.create({
      type: "market_purchase",
      financialWorkflowVersion: 1,
      marketFeePolicyVersion: 1,
      marketFeeTreasuryAccount: input.feeTreasuryAccount,
      paymentCurrency: input.paymentCurrency,
      paymentAccount: input.paymentAccount,
      signature: input.paymentTxId,
      paymentOperationIndex: input.paymentOperationIndex,
      walletAddress: input.walletAddress,
      itemId: input.itemId,
      itemType: input.itemType,
      price: input.price,
      paymentTxId: input.paymentTxId,
      eventTime: gameActionNow(),
      randomSeed: gameActionSeed() ?? randomUUID(),
      status: "pending",
      retryCount: 0,
    });
    return {
      jobId: String(doc._id),
      signature: input.paymentTxId,
      duplicate: false,
    };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      return { jobId: "", signature: input.paymentTxId, duplicate: true };
    }
    throw err;
  }
}

/**
 * One-time on-chain HIVE registration fee (see
 * docs/GAME_ARCHITECTURE.md §4.1). The fixed HIVE fee is recorded
 * on the job so the settlement worker checks against what was required at
 * enqueue time. Idempotent on the payment txId, same as enqueueDeposit.
 */
export async function enqueueRegistration(input: {
  paymentOperationIndex?: number;
  walletAddress: string;
  depositTxId: string;
  registrationHiveAmount: number;
}): Promise<{ jobId: string; duplicate: boolean }> {
  await connectDatabase();
  try {
    const doc = await InboundTransactionModel.create({
      type: "registration",
      signature: input.depositTxId,
      paymentOperationIndex: input.paymentOperationIndex,
      walletAddress: input.walletAddress,
      depositTxId: input.depositTxId,
      registrationHiveAmount: input.registrationHiveAmount,
      referralPolicyVersion: 1,
      eventTime: gameActionNow(),
      randomSeed: gameActionSeed() ?? randomUUID(),
      status: "pending",
      retryCount: 0,
    });
    return { jobId: String(doc._id), duplicate: false };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000)
      return { jobId: "", duplicate: true };
    throw err;
  }
}

/**
 * HIVE-paid Shop purchase. The payment txId is the idempotency key, so one
 * on-chain transfer can never grant twice. The expected HIVE amount is
 * computed by the caller from the fixed price table, never from the client.
 */
export async function enqueueShopPurchase(input: {
  paymentOperationIndex?: number;
  walletAddress: string;
  paymentTxId: string;
  shopKind: "chest" | "consumable";
  shopItemId: string;
  shopQuantity: number;
  shopHiveAmount: number;
}): Promise<{ jobId: string; duplicate: boolean }> {
  await connectDatabase();
  try {
    const doc = await InboundTransactionModel.create({
      type: "shop_purchase",
      signature: input.paymentTxId,
      paymentOperationIndex: input.paymentOperationIndex,
      walletAddress: input.walletAddress,
      paymentTxId: input.paymentTxId,
      shopKind: input.shopKind,
      shopItemId: input.shopItemId,
      shopQuantity: input.shopQuantity,
      shopHiveAmount: input.shopHiveAmount,
      shopFulfillment: "inventory",
      referralPolicyVersion: 1,
      eventTime: gameActionNow(),
      randomSeed: gameActionSeed() ?? randomUUID(),
      status: "pending",
      retryCount: 0,
    });
    return { jobId: String(doc._id), duplicate: false };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000)
      return { jobId: "", duplicate: true };
    throw err;
  }
}

export async function findPendingBySignature(
  signature: string,
): Promise<IInboundTransaction | null> {
  await connectDatabase();
  return InboundTransactionModel.findOne({ signature }).exec();
}

export async function listPendingOldestFirst(
  limit = 0,
): Promise<IInboundTransaction[]> {
  await connectDatabase();
  const q = InboundTransactionModel.find({
    type: { $ne: "game_action" },
    status: { $in: ["pending", "failed"] satisfies InboundTxStatus[] },
  }).sort({ createdAt: 1 });
  if (limit > 0) q.limit(limit);
  return q.exec();
}

export async function findPendingByWallet(
  wallet: string,
  limit = 25,
): Promise<IInboundTransaction[]> {
  await connectDatabase();
  return InboundTransactionModel.find({ walletAddress: wallet })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}

export async function hasRegistrationJob(wallet: string): Promise<boolean> {
  await connectDatabase();
  return !!(await InboundTransactionModel.exists({
    walletAddress: wallet,
    type: "registration",
  }));
}

export async function completeJob(id: string): Promise<void> {
  await connectDatabase();
  const result = await InboundTransactionModel.deleteOne({
    _id: id,
    $and: [
      {
        $or: [
          { registrationStarterPack: { $exists: false } },
          {
            registrationStarterPackArchived: true,
            databaseEffectsStarted: { $ne: true },
          },
        ],
      },
    ],
    referralStatus: { $ne: "pending" },
    marketFeeStatus: { $ne: "pending" },
    $or: [{ refunded: true }, { "treasuryTransfers.state": { $ne: "failed" } }],
    treasuryTransfers: {
      $not: {
        $elemMatch: {
          $or: [
            { state: { $nin: ["confirmed", "failed"] } },
            { verifiedAt: { $exists: false } },
            { transactionId: { $exists: false } },
            { transactionId: "" },
            { transactionId: null },
          ],
        },
      },
    },
  });
  if (
    !result.deletedCount &&
    (await InboundTransactionModel.exists({ _id: id }))
  )
    throw new Error("Cannot delete a job with an uncertain treasury transfer");
}

/** Attribution is write-once; callers must compare the returned immutable evidence. */
export async function captureReferralObligation(
  signature: string,
  obligation: ReferralObligation,
): Promise<ReferralObligation> {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    {
      signature,
      referralPolicyVersion: 1,
      referralObligation: { $exists: false },
    },
    {
      $set: {
        referralObligation: obligation,
        referralStatus:
          obligation.referrer && obligation.rewardMilli > 0
            ? "pending"
            : "not_due",
      },
    },
  );
  const job = await InboundTransactionModel.findOne({ signature }).lean();
  if (!job?.referralObligation) throw new Error("Referral capture unavailable");
  return job.referralObligation;
}

export async function finishReferralObligation(
  signature: string,
  status: "paid" | "not_due",
) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    {
      signature,
      referralPolicyVersion: 1,
      referralObligation: { $exists: true },
    },
    { $set: { referralStatus: status } },
  );
}

export async function parkJob(id: string, reason: string): Promise<void> {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    { _id: id },
    { $set: { status: "reconciliation", lastError: reason.slice(0, 500) } },
  );
}
export async function setMarketSettlement(
  id: string,
  settlement: NonNullable<IInboundTransaction["marketSettlement"]>,
): Promise<void> {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    { _id: id },
    { $set: { marketSettlement: settlement } },
  );
}

export async function captureMarketFeeObligation(
  signature: string,
  obligation: MarketFeeObligation,
): Promise<MarketFeeObligation> {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    {
      signature,
      type: "market_purchase",
      marketFeePolicyVersion: 1,
      marketFeeTreasuryAccount: obligation.to,
      marketFeeObligation: { $exists: false },
    },
    { $set: { marketFeeObligation: obligation, marketFeeStatus: "pending" } },
  );
  const job = await InboundTransactionModel.findOne({ signature }).lean();
  if (!job?.marketFeeObligation)
    throw new Error("Marketplace fee capture unavailable");
  return job.marketFeeObligation;
}

/** Status cannot conceal a possibly broadcast fee or change an already paid obligation. */
export async function finishMarketFeeObligation(
  signature: string,
  status: "paid" | "not_due",
) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      type: "market_purchase",
      marketFeePolicyVersion: 1,
      $or: [
        { marketFeeStatus: { $exists: false } },
        { marketFeeStatus: "pending" },
        { marketFeeStatus: status },
      ],
      ...(status === "paid"
        ? {
            treasuryTransfers: {
              $elemMatch: {
                key: `market-fee:${signature}`,
                state: "confirmed",
                transactionId: { $type: "string", $ne: "" },
                verifiedAt: { $exists: true },
              },
            },
          }
        : { "treasuryTransfers.key": { $ne: `market-fee:${signature}` } }),
    },
    { $set: { marketFeeStatus: status } },
  );
  if (!result.matchedCount)
    throw new Error("Marketplace fee status changed or payment is uncertain");
}

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
  const dead = doc.retryCount >= maxRetries;
  doc.status = dead ? "dead" : "failed";
  await doc.save();
  return dead;
}

import type { CustomJsonEvent } from "hivexph-sdk";
import { isDeepStrictEqual } from "node:util";
import { withDatabaseBookkeeping } from "@/lib/utils/database/operation.server";
import { RaidEvidenceConflict } from "@/features/types/game/raid-settlement";
import type {
  RaidSettlement,
  RaidStage,
} from "@/features/types/game/raid-settlement";

/** Bounded reads, including reconciliation jobs: isolation must survive process restart. */
export async function* readQueuedGameBatches(participants?: string[]) {
  await connectDatabase();
  let cursor: import("mongoose").Types.ObjectId | undefined;
  for (;;) {
    const rows = await InboundTransactionModel.find({
      type: "game_action",
      ...(participants?.length
        ? {
            $or: [
              { "gameEvent.participants": { $in: participants } },
              { "gameEvent.participants": { $exists: false } },
            ],
          }
        : {}),
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    })
      .sort({ _id: 1 })
      .limit(250)
      .lean();
    if (!rows.length) return;
    yield rows;
    cursor = rows[rows.length - 1]._id;
  }
}

export async function* readRecoverableGameBatches() {
  await connectDatabase();
  let cursor:
    | {
        block: number;
        transaction: number;
        operation: number;
        id: import("mongoose").Types.ObjectId;
      }
    | undefined;
  for (;;) {
    const after = cursor
      ? {
          $or: [
            { "gameEvent.blockNumber": { $gt: cursor.block } },
            {
              "gameEvent.blockNumber": cursor.block,
              "gameEvent.transactionIndex": { $gt: cursor.transaction },
            },
            {
              "gameEvent.blockNumber": cursor.block,
              "gameEvent.transactionIndex": cursor.transaction,
              "gameEvent.operationIndex": { $gt: cursor.operation },
            },
            {
              "gameEvent.blockNumber": cursor.block,
              "gameEvent.transactionIndex": cursor.transaction,
              "gameEvent.operationIndex": cursor.operation,
              _id: { $gt: cursor.id },
            },
          ],
        }
      : {};
    const rows = await InboundTransactionModel.find({
      type: "game_action",
      status: { $ne: "reconciliation" },
      ...after,
    })
      .sort({
        "gameEvent.blockNumber": 1,
        "gameEvent.transactionIndex": 1,
        "gameEvent.operationIndex": 1,
        _id: 1,
      })
      .limit(250)
      .lean();
    if (!rows.length) return;
    yield rows;
    const last = rows[rows.length - 1];
    if (
      !last.gameEvent ||
      ![
        last.gameEvent.blockNumber,
        last.gameEvent.transactionIndex,
        last.gameEvent.operationIndex,
      ].every(Number.isSafeInteger)
    )
      throw new Error("Invalid queued gameplay order");
    cursor = {
      block: last.gameEvent.blockNumber,
      transaction: last.gameEvent.transactionIndex,
      operation: last.gameEvent.operationIndex,
      id: last._id,
    };
  }
}

export async function setGameDependencies(
  key: string,
  participants: string[],
  waitingFor: string[],
  token?: string,
) {
  await connectDatabase();
  const result = await withDatabaseBookkeeping(() =>
    InboundTransactionModel.updateOne(
      {
        signature: key,
        type: "game_action",
        ...(token ? { "gameEvent.claimToken": token } : {}),
      },
      {
        $set: {
          "gameEvent.participants": participants,
          "gameEvent.waitingFor": waitingFor,
        },
        // A wait is not an execution attempt.
        ...(waitingFor.length ? { $inc: { "gameEvent.attempts": -1 } } : {}),
      },
    ).exec(),
  );
  if (!result.matchedCount)
    throw new Error("Missing owned gameplay dependency record");
}

export async function saveRaidSettlement(key: string, journal: RaidSettlement) {
  await connectDatabase();
  await withDatabaseBookkeeping(() =>
    InboundTransactionModel.updateOne(
      {
        signature: key,
        type: "game_action",
        "gameEvent.raidSettlement": { $exists: false },
      },
      { $set: { "gameEvent.raidSettlement": journal } },
    ).exec(),
  );
  const saved = await getPendingGameEvent(key);
  if (!isDeepStrictEqual(saved?.raidSettlement, journal))
    throw new RaidEvidenceConflict("Conflicting raid journal");
}

export async function setRaidStage(
  key: string,
  stage: RaidStage,
  failed = false,
) {
  await connectDatabase();
  const result = await withDatabaseBookkeeping(() =>
    InboundTransactionModel.updateOne(
      { signature: key, type: "game_action" },
      { $set: { "gameEvent.stage": stage } },
    ).exec(),
  );
  if (!result.matchedCount) throw new Error("Missing raid stage record");
  if (failed)
    await withDatabaseBookkeeping(() =>
      InboundTransactionModel.updateOne(
        { signature: key, "gameEvent.firstFailure": { $exists: false } },
        {
          $set: {
            "gameEvent.firstFailure": { stage, code: "RAID_WRITE_UNCERTAIN" },
          },
        },
      ).exec(),
    );
}

export async function setPaymentDependencies(
  signature: string,
  keys: string[],
) {
  await connectDatabase();
  const result = await withDatabaseBookkeeping(() =>
    InboundTransactionModel.updateOne(
      { signature, type: { $ne: "game_action" } },
      { $set: { dependencyKeys: keys } },
    ).exec(),
  );
  if (!result.matchedCount)
    throw new Error("Missing payment dependency record");
}

/** Operator-only resumption after journal/marker verification. Never clears effects. */
export async function resumeVerifiedRaid(key: string, journal: RaidSettlement) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature: key,
      type: "game_action",
      status: "reconciliation",
      "gameEvent.raidSettlement": journal,
    },
    {
      $set: {
        status: "failed",
        "gameEvent.status": "failed",
        "gameEvent.attempts": 0,
        "gameEvent.claimUntil": 0,
      },
    },
  );
  if (!result.matchedCount)
    throw new Error("Raid changed during evidence review");
}
import {
  gameEventKey,
  toGameEventRecord,
} from "@/lib/utils/game/event-identity.server";

export async function getPendingGameEvent(
  eventKey: string,
  token?: string,
): Promise<GameEventRecord | null> {
  await connectDatabase();
  const job = await InboundTransactionModel.findOne({
    signature: eventKey,
    type: "game_action",
    ...(token ? { "gameEvent.claimToken": token } : {}),
  }).lean();
  return job?.gameEvent ?? null;
}
export async function findPendingGameNonce(
  actor: string,
  nonce: string,
  exceptKey: string,
  current: GameEventRecord | null,
) {
  await connectDatabase();
  const earlier = current
    ? {
        $or: [
          { "gameEvent.blockNumber": { $lt: current.blockNumber } },
          {
            "gameEvent.blockNumber": current.blockNumber,
            "gameEvent.transactionIndex": { $lt: current.transactionIndex },
          },
          {
            "gameEvent.blockNumber": current.blockNumber,
            "gameEvent.transactionIndex": current.transactionIndex,
            "gameEvent.operationIndex": { $lte: current.operationIndex },
          },
        ],
      }
    : {};
  const job = await InboundTransactionModel.findOne({
    ...earlier,
    type: "game_action",
    signature: { $ne: exceptKey },
    "gameEvent.actor": actor,
    "gameEvent.nonce": nonce,
  }).lean();
  return job?.gameEvent ?? null;
}
export async function listRecoverableGameActions(): Promise<CustomJsonEvent[]> {
  await connectDatabase();
  const jobs = await InboundTransactionModel.find({
    type: "game_action",
    status: { $ne: "reconciliation" },
    $or: [
      { status: "failed" },
      { "gameEvent.claimUntil": { $lte: Date.now() } },
    ],
  })
    .sort({
      "gameEvent.blockNumber": 1,
      "gameEvent.transactionIndex": 1,
      "gameEvent.operationIndex": 1,
    })
    .lean();
  return jobs.flatMap((job) =>
    job.gameEvent?.event ? [job.gameEvent.event] : [],
  );
}
export async function claimPendingGameAction(
  event: CustomJsonEvent,
  token?: string,
): Promise<"claimed" | "in-flight" | "reconciliation"> {
  const eventKey = gameEventKey(event);
  const existing = await getPendingGameEvent(eventKey);
  if (existing) {
    const interrupted = await InboundTransactionModel.findOne({
      signature: eventKey,
      $or: [{ databaseEffectsStarted: true }, { status: "reconciliation" }],
    }).lean();
    if (interrupted?.status === "reconciliation") return "reconciliation";
    if (
      interrupted &&
      interrupted.financialWorkflowVersion !== 1 &&
      !(
        existing.event?.action === "raid" &&
        existing.raidSettlement?.version === 1 &&
        existing.raidSettlement.key === eventKey
      )
    ) {
      // Never replay effects after a crash in a direct-write sequence.
      await parkGameAction(
        eventKey,
        "Interrupted database writes require operator review",
      );
      return "reconciliation";
    }
    const result = await InboundTransactionModel.updateOne(
      {
        signature: eventKey,
        type: "game_action",
        status: { $ne: "reconciliation" },
        $and: [
          {
            $or: [
              { databaseEffectsStarted: { $ne: true } },
              { financialWorkflowVersion: 1 },
              {
                "gameEvent.event.action": "raid",
                "gameEvent.raidSettlement.version": 1,
                "gameEvent.raidSettlement.key": eventKey,
              },
            ],
          },
        ],
        $or: [
          { status: "failed" },
          { "gameEvent.waitingFor.0": { $exists: true } },
          { "gameEvent.claimUntil": { $lte: Date.now() } },
        ],
      },
      {
        $set: {
          status: "pending",
          "gameEvent.status": "queued",
          "gameEvent.claimToken": token,
          "gameEvent.claimUntil": Date.now() + 30_000,
          "gameEvent.updatedAt": Date.now(),
        },
        $inc: { "gameEvent.attempts": 1 },
      },
    );
    return result.modifiedCount ? "claimed" : "in-flight";
  }
  try {
    await InboundTransactionModel.create({
      type: "game_action",
      signature: eventKey,
      walletAddress: event.account || "unknown",
      gameEvent: { ...toGameEventRecord(event, "queued"), claimToken: token },
      status: "pending",
    });
    return "claimed";
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return "in-flight";
  }
}
export async function deleteClaimedGameAction(
  eventKey: string,
  token?: string,
) {
  await connectDatabase();
  const result = await InboundTransactionModel.deleteOne({
    signature: eventKey,
    type: "game_action",
    ...(token ? { "gameEvent.claimToken": token } : {}),
  });
  if (!result.deletedCount) throw new Error("Missing claimed gameplay job");
}
export async function markGameActionFailed(
  eventKey: string,
  reason: string,
  token?: string,
) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    {
      signature: eventKey,
      type: "game_action",
      ...(token ? { "gameEvent.claimToken": token } : {}),
    },
    {
      $set: {
        status: "failed",
        lastError: reason.slice(0, 500),
        "gameEvent.status": "failed",
        "gameEvent.reason": reason.slice(0, 500),
        "gameEvent.updatedAt": Date.now(),
      },
      $inc: { retryCount: 1 },
    },
  );
}
export async function resumeReconciledPayment(signature: string) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    {
      signature,
      status: "reconciliation",
      databaseEffectsStarted: { $ne: true },
    },
    {
      $set: {
        status: "pending",
        lastError: "Verified treasury transfer; resuming settlement",
      },
    },
  );
}

export async function beginQueuedDatabaseEffects(
  signature: string,
  token?: string,
) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      status: { $in: ["pending", "failed"] },
      $or: [
        { databaseEffectsStarted: { $ne: true } },
        {
          type: "game_action",
          "gameEvent.event.action": "raid",
          "gameEvent.raidSettlement.version": 1,
          "gameEvent.raidSettlement.key": signature,
        },
      ],
      ...(token ? { "gameEvent.claimToken": token } : {}),
    },
    { $set: { databaseEffectsStarted: true } },
  );
  if (result.matchedCount !== 1)
    throw new Error(
      "Missing, interrupted or unowned database job; operator review required",
    );
}

export async function clearQueuedDatabaseEffects(signature: string) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    { signature },
    { $unset: { databaseEffectsStarted: 1 } },
  );
}

export async function parkGameAction(
  eventKey: string,
  reason: string,
  token?: string,
) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature: eventKey,
      type: "game_action",
      ...(token ? { "gameEvent.claimToken": token } : {}),
    },
    {
      $set: {
        status: "reconciliation",
        lastError: reason.slice(0, 500),
        "gameEvent.status": "reconciliation",
        "gameEvent.reason": reason.slice(0, 500),
        "gameEvent.updatedAt": Date.now(),
      },
    },
  );
  if (!result.matchedCount)
    throw new Error("Missing owned gameplay quarantine record");
  const saved = await getPendingGameEvent(eventKey, token);
  if (
    !saved?.event ||
    saved.status !== "reconciliation" ||
    saved.eventKey !== eventKey ||
    !saved.randomSeed
  )
    throw new Error("Cannot verify gameplay quarantine record");
}

export async function getPendingTreasuryTransfer(
  signature: string,
  key: string,
): Promise<TreasuryTransfer | null> {
  await connectDatabase();
  const job = await InboundTransactionModel.findOne(
    { signature },
    { treasuryTransfers: 1 },
  ).lean();
  return job?.treasuryTransfers?.find((t) => t.key === key) ?? null;
}
export async function claimTreasuryTransfer(
  signature: string,
  key: string,
  intent: TreasuryIntent,
): Promise<boolean> {
  if (!intent.from || !["treasury", "market"].includes(intent.accountAlias))
    throw new Error("Missing transfer signing evidence");
  if (
    intent.operation !== undefined &&
    !["transfer", "issue"].includes(intent.operation)
  )
    throw new Error("Unsupported treasury operation");
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      type:
        intent.operation !== undefined ? "withdrawal" : { $ne: "game_action" },
      status: { $in: ["pending", "failed"] },
      $or: [
        { type: { $ne: "withdrawal" } },
        { financialWorkflowVersion: 1, financialPhase: "reserved" },
      ],
      "treasuryTransfers.key": { $ne: key },
      ...(intent.operation !== undefined
        ? { withdrawalPayoutPolicyVersion: 1 }
        : { withdrawalPayoutPolicyVersion: { $exists: false } }),
    },
    { $push: { treasuryTransfers: { key, intent, state: "broadcasting" } } },
  );
  return result.modifiedCount === 1;
}
export async function markJobRefunded(signature: string) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    { signature },
    { $set: { refunded: true } },
  );
}

export async function getPendingTreasuryTransfers(
  signature: string,
): Promise<TreasuryTransfer[]> {
  await connectDatabase();
  const job = await InboundTransactionModel.findOne(
    { signature },
    { treasuryTransfers: 1 },
  ).lean();
  return job?.treasuryTransfers ?? [];
}

/** Capture only before any primary effect. Saved decisions are compared by the workflow. */
export async function captureRegistrationStarterPack(
  signature: string,
  decision: import("./server.types").RegistrationStarterPack,
) {
  await connectDatabase();
  await InboundTransactionModel.updateOne(
    {
      signature,
      type: "registration",
      walletAddress: decision.wallet,
      status: { $in: ["pending", "failed"] },
      databaseEffectsStarted: { $ne: true },
      registrationStarterPack: { $exists: false },
      registrationStarterItemsGranted: { $exists: false },
    },
    { $set: { registrationStarterPack: decision } },
  );
  const job = await InboundTransactionModel.findOne({
    signature,
    type: "registration",
  }).lean();
  if (
    !job?.registrationStarterPack ||
    job.databaseEffectsStarted ||
    !["pending", "failed"].includes(job.status)
  )
    throw new Error("Registration reward decision requires operator review");
  return job.registrationStarterPack;
}

/** An acknowledgement follows the item write; an unknown outcome is never replayed. */
export async function recordRegistrationStarterGrant(
  signature: string,
  award: import("@/features/types/game/inventory").StartingItemAward,
) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      type: "registration",
      databaseEffectsStarted: true,
      status: { $in: ["pending", "failed"] },
      "registrationStarterPack.items": { $elemMatch: award },
      "registrationStarterItemsGranted.itemId": { $ne: award.itemId },
    },
    { $push: { registrationStarterItemsGranted: award } },
  );
  if (result.modifiedCount !== 1)
    throw new Error(
      "Registration grant acknowledgement requires operator review",
    );
}

/** Called only after the workflow verifies the durable source receipt and all grant evidence. */
export async function markRegistrationStarterArchived(signature: string) {
  await connectDatabase();
  const result = await InboundTransactionModel.updateOne(
    {
      signature,
      type: "registration",
      registrationStarterPack: { $exists: true },
      databaseEffectsStarted: { $ne: true },
    },
    { $set: { registrationStarterPackArchived: true } },
  );
  if (result.matchedCount !== 1)
    throw new Error("Missing registration archive acknowledgement");
}
