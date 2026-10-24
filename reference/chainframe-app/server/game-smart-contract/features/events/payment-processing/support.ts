import { isDeepStrictEqual } from "node:util";
import {
  GameplayDependencyHold,
  holdPaymentFulfillment,
} from "@/features/events/backend/raid/dependencies";
import {
  SettlementUncertainError,
  TreasuryPendingError,
  TreasuryFailedError,
} from "@/server/game-smart-contract/features/events/treasury/errors.server";
import {
  archiveTreasuryTransfers,
  getProcessedTransaction,
  recordFailedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";

import { clearWithdrawalReservation } from "@/lib/modules/players/server.repository";
import { clearMarketReservation } from "@/lib/modules/equipments/server.repository";
import { clearSettlementStat } from "@/lib/modules/game-stats/server.repository";
import {
  withDatabaseOperation,
  DatabaseOperationUncertainError,
} from "@/lib/utils/database/operation.server";

import {
  completeJob,
  getPendingTreasuryTransfers,
  findPendingBySignature,
  failJob,
  parkJob,
  beginQueuedDatabaseEffects,
  markRegistrationStarterArchived,
  clearQueuedDatabaseEffects,
  finishReferralObligation,
  finishMarketFeeObligation,
} from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";

import type { ProcessedTxMetadata } from "@/lib/modules/transactions-processed/server.types";

import {
  createErrorLog,
  createLog,
} from "@/lib/modules/logs/server.repository";
import { logger } from "@/lib/logger.server";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";

export const NON_RETRYABLE = new Set([
  "INSUFFICIENT_HASH",
  "VERIFICATION_FAILED",
  "NOT_FOUND",
  "INVALID_AMOUNT",
  "INVALID_WALLET",
  "LISTING_GONE",
]);

export function withPaymentDatabaseOperation<T>(
  job: IInboundTransaction,
  execute: () => Promise<T>,
  primary = true,
) {
  const guarded = async () => {
    if (primary && (await holdPaymentFulfillment(job)))
      throw new GameplayDependencyHold();
    return execute();
  };
  if (job.financialWorkflowVersion === 1) return withDatabaseOperation(guarded);
  return withDatabaseOperation(guarded, {
    beforeWrite: () => beginQueuedDatabaseEffects(job.signature),
    afterSuccess: () => clearQueuedDatabaseEffects(job.signature),
  });
}

export function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null
    ? (err as { code?: string }).code
    : undefined;
}

export function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function finalizeDead(
  context: SettlementContext,
  job: IInboundTransaction,
  label: string,
  reason: string,
): Promise<void> {
  const id = String(job._id);
  const amount =
    job.withdrawAmount ??
    job.depositAmount ??
    job.price ??
    job.registrationHiveAmount ??
    job.shopHiveAmount ??
    0;

  let metadata: ProcessedTxMetadata | undefined;
  if (job.type === "withdrawal") {
    metadata = {
      type: "withdrawal",
      payoutTxHash: "",
      reservationAccepted: job.financialPhase !== "rejected",
    };
  } else if (job.type === "deposit") {
    metadata = { type: "deposit", creditedAmount: 0 };
  } else if (job.type === "registration") {
    metadata = {
      type: "registration",
      registrationHiveAmount: job.registrationHiveAmount ?? 0,
      registrationHiveAmountPaid: 0,
      ...(job.registrationStarterPack
        ? {
            registrationStarterPack: job.registrationStarterPack,
            registrationStarterItemsGranted:
              job.registrationStarterItemsGranted ?? [],
          }
        : {}),
    };
  } else if (job.type === "shop_purchase") {
    metadata = {
      type: "shop_purchase",
      shopKind: job.shopKind ?? "consumable",
      shopItemId: job.shopItemId ?? "",
      shopQuantity: job.shopQuantity ?? 1,
      shopHiveAmount: job.shopHiveAmount ?? 0,
      shopHiveAmountPaid: 0,
    };
  } else {
    metadata = {
      type: "market_purchase",
      ...(job.paymentCurrency === "HIVE" ? { currency: "HIVE" as const } : {}),
      itemId: job.itemId ?? "",
      itemType: job.itemType ?? "item",
      seller: "",
      price: amount,
      fee: 0,
      ...(job.marketFeePolicyVersion === 1
        ? {
            marketFeePolicyVersion: 1,
            marketFeeObligation: job.marketFeeObligation,
            marketFeeStatus: "not_due" as const,
          }
        : {}),
    };
  }

  await withPaymentDatabaseOperation(
    job,
    async () => {
      await context.checkLease();
      if (job.financialWorkflowVersion === 1)
        await createLog({
          settlementKey: `financial-failed:${job.signature}`,
          type: "error",
          wallet: job.walletAddress,
          data: { errorType: label, error: reason, dead: true, jobId: id },
        });
      else
        await createErrorLog({
          type: label,
          wallet: job.walletAddress,
          error: reason,
          data: { dead: true, jobId: id },
        });
      await recordFailedTransaction({
        txHash: job.signature,
        wallet: job.walletAddress,
        type: job.type,
        amount,
        error: reason,
        metadata: metadata
          ? { ...metadata, paymentOperationIndex: job.paymentOperationIndex }
          : undefined,
      });
      if (!job.registrationStarterPack) await completePaymentJob(job);
    },
    false,
  );
  if (job.registrationStarterPack) await completePaymentJob(job);
  logger.warn(`dead-lettered ${label} — removed from pending queue`, {
    wallet: job.walletAddress,
    reason,
  });
}

export async function retryOrDie(
  context: SettlementContext,
  job: IInboundTransaction,
  label: string,
  err: unknown,
): Promise<void> {
  const id = String(job._id);
  if (err instanceof GameplayDependencyHold) return;
  if (err instanceof TreasuryPendingError) return;
  if (
    err instanceof SettlementUncertainError ||
    err instanceof TreasuryFailedError ||
    (err instanceof DatabaseOperationUncertainError &&
      job.financialWorkflowVersion !== 1)
  ) {
    await parkJob(id, message(err));
    logger.warn("payment job parked for reconciliation", {
      signature: job.signature,
      type: job.type,
      stage: "settlement",
      code:
        err instanceof TreasuryFailedError
          ? "TRANSFER_FAILED"
          : "SETTLEMENT_UNCERTAIN",
    });
    return;
  }
  const code = errorCode(err);
  const source =
    job.referralPolicyVersion === 1 || job.marketFeePolicyVersion === 1
      ? await getProcessedTransaction(job.signature)
      : null;
  if (code && NON_RETRYABLE.has(code) && source?.status !== "success") {
    await finalizeDead(context, job, label, `${code}: ${message(err)}`);
    return;
  }
  const dead = await failJob(id, message(err), context.maxRetries);
  if (dead) {
    await parkJob(id, `Settlement retry limit reached: ${message(err)}`);
    return;
  }
  if (source?.status === "success") {
    logger.warn(
      job.marketFeePolicyVersion === 1
        ? "marketplace fee finalization retry scheduled"
        : "referral finalization retry scheduled",
      { signature: job.signature },
    );
    return;
  }
  await createErrorLog({
    type: label,
    wallet: job.walletAddress,
    error: message(err),
    data: { dead: false, jobId: id },
  });
  logger.warn(`${label} retry scheduled`, { wallet: job.walletAddress });
}

export async function loadTreasuryTransfers(signature: string) {
  const transfers = await getPendingTreasuryTransfers(signature);
  if (
    transfers.some(
      (t) =>
        !["confirmed", "failed"].includes(t.state) ||
        !t.transactionId ||
        !t.verifiedAt ||
        !Number.isInteger(t.operationIndex) ||
        !Number.isInteger(t.blockNumber),
    )
  )
    throw new Error("Cannot finalize an uncertain treasury transfer");
  return transfers;
}
export async function completePaymentJob(job: IInboundTransaction) {
  const cleanup = async () => {
    const pending = await findPendingBySignature(job.signature);
    if (pending?.registrationStarterPack) {
      const receipt = await getProcessedTransaction(job.signature);
      if (
        !receipt ||
        pending.databaseEffectsStarted ||
        receipt.metadata?.type !== "registration" ||
        !isDeepStrictEqual(
          receipt.metadata.registrationStarterPack,
          pending.registrationStarterPack,
        ) ||
        !isDeepStrictEqual(
          receipt.metadata.registrationStarterItemsGranted,
          pending.registrationStarterItemsGranted ?? [],
        )
      )
        throw new SettlementUncertainError(
          "Registration reward evidence must be archived before cleanup",
        );
      await markRegistrationStarterArchived(job.signature);
    }
    if (pending?.marketFeePolicyVersion === 1) {
      const receipt = await getProcessedTransaction(job.signature);
      if (receipt?.status === "failed") {
        await finishMarketFeeObligation(job.signature, "not_due");
      } else if (
        !pending.marketFeeObligation ||
        !["paid", "not_due"].includes(pending.marketFeeStatus ?? "")
      ) {
        throw new Error("Cannot clean an unpaid marketplace fee obligation");
      }
    }
    if (pending?.referralStatus === "pending") {
      const receipt = await getProcessedTransaction(job.signature);
      if (receipt?.status !== "failed")
        throw new Error("Cannot clean an unpaid referral obligation");
      await finishReferralObligation(job.signature, "not_due");
    }
    const transfers = await loadTreasuryTransfers(job.signature);
    if (
      transfers.some((transfer) => transfer.state === "failed") &&
      !(await findPendingBySignature(job.signature))?.refunded
    )
      throw new Error(
        "Cannot clean failed transfer evidence before compensation",
      );
    if (transfers.length)
      await archiveTreasuryTransfers(job.signature, transfers);
    if (job.financialWorkflowVersion === 1) {
      if (!(await getProcessedTransaction(job.signature)))
        throw new Error(
          "Cannot clean financial evidence before terminal receipt",
        );
      if (job.type === "withdrawal") {
        await clearWithdrawalReservation(job.walletAddress, job.signature);
        await clearSettlementStat("totalHashWithdrawn", job.signature);
      } else if (job.type === "market_purchase") {
        await clearMarketReservation(job.itemId!, job.signature);
        await clearSettlementStat("totalMarketSales", job.signature);
      }
    }
    await completeJob(String(job._id));
  };
  if (job.registrationStarterPack) await withDatabaseOperation(cleanup);
  else await withPaymentDatabaseOperation(job, cleanup, false);
}
