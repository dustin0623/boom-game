import { isDeepStrictEqual } from "node:util";
import { config } from "@/lib/config/config";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { createLog } from "@/lib/modules/logs/server.repository";
import {
  captureReferralObligation,
  markRegistrationStarterArchived,
  finishReferralObligation,
  completeJob,
} from "@/lib/modules/transactions-pending/server.repository";
import {
  archiveTreasuryTransfers,
  getProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";
import type {
  IInboundTransaction,
  ReferralObligation,
} from "@/lib/modules/transactions-pending/server.types";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { getHiveReferralMilli, toMilliHive } from "@/lib/utils/game/pricing";
import {
  withDatabaseOperation,
  DatabaseOperationUncertainError,
} from "@/lib/utils/database/operation.server";
import { dispatchTreasuryTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch";
import { requireConfirmedTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import { SettlementUncertainError } from "@/server/game-smart-contract/features/events/treasury/errors.server";
import { loadTreasuryTransfers } from "./support";

function checkObligation(
  job: IInboundTransaction,
  basis: number,
  value: ReferralObligation,
) {
  try {
    const source =
      (job.type === "registration" ? job.depositTxId : job.paymentTxId) ??
      job.signature;
    if (
      job.referralPolicyVersion !== 1 ||
      value.source !== source ||
      basis !==
        (job.type === "registration"
          ? job.registrationHiveAmount
          : job.shopHiveAmount) ||
      value.paymentType !== job.type ||
      value.buyer !== job.walletAddress ||
      !Number.isInteger(value.operationIndex) ||
      value.operationIndex < 0 ||
      value.operationIndex !== job.paymentOperationIndex ||
      value.basisMilli !== toMilliHive(basis) ||
      value.rewardMilli !== getHiveReferralMilli(basis) ||
      value.accountAlias !== "treasury" ||
      !value.from ||
      value.from !== config.blockchain.treasuryAccount ||
      (value.referrer !== null &&
        (!value.referrer || value.referrer === value.buyer)) ||
      value.quantity !== (job.type === "registration" ? 1 : job.shopQuantity) ||
      value.itemId !==
        (job.type === "registration" ? undefined : job.shopItemId)
    )
      throw new SettlementUncertainError(
        "Referral obligation evidence mismatch",
      );
  } catch {
    throw new SettlementUncertainError(
      "Invalid or changed referral obligation; operator review required",
    );
  }
}

/** Call after exact incoming verification, before primary effects. Attribution is write-once. */
export async function prepareNativeReferral(
  job: IInboundTransaction,
  basis: number,
) {
  if (job.referralObligation) {
    checkObligation(job, basis, job.referralObligation);
    return;
  }
  const buyer = await playerRepository.findByWallet(job.walletAddress);
  const referredBy = buyer?.referredBy;
  const referrer =
    referredBy && referredBy !== job.walletAddress
      ? await playerRepository.findByWallet(referredBy)
      : null;
  const from = hiveClient.resolveAccount("treasury").account;
  const obligation: ReferralObligation = {
    source:
      (job.type === "registration" ? job.depositTxId : job.paymentTxId) ??
      job.signature,
    operationIndex: job.paymentOperationIndex!,
    paymentType: job.type as "registration" | "shop_purchase",
    buyer: job.walletAddress,
    referrer: referrer ? referredBy! : null,
    basisMilli: toMilliHive(basis),
    rewardMilli: getHiveReferralMilli(basis),
    accountAlias: "treasury",
    from,
    quantity: job.type === "registration" ? 1 : job.shopQuantity!,
    ...(job.type === "shop_purchase" ? { itemId: job.shopItemId } : {}),
  };
  checkObligation(job, basis, obligation);
  const captured = await captureReferralObligation(job.signature, obligation);
  if (
    Object.entries(obligation).some(
      ([key, value]) => captured[key as keyof ReferralObligation] !== value,
    )
  )
    throw new SettlementUncertainError(
      "Competing referral attribution requires review",
    );
  job.referralObligation = captured;
}

/** The source receipt confirms the buyer independently of this durable follow-up. */
export async function settleNativeReferral(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<boolean> {
  try {
    const receipt = await getProcessedTransaction(job.signature);
    if (!receipt) return false;
    const value = job.referralObligation;
    if (
      receipt.status !== "success" ||
      receipt.wallet !== job.walletAddress ||
      receipt.type !== job.type ||
      receipt.metadata?.referralPolicyVersion !== 1 ||
      typeof receipt.metadata.referralEligible !== "boolean" ||
      !value ||
      job.databaseEffectsStarted
    )
      throw new SettlementUncertainError(
        "Referral source completion evidence is required",
      );
    checkObligation(job, receipt.amount, value);
    const metadata = receipt.metadata;
    const grantedItems = Array.from(job.registrationStarterItemsGranted ?? [], ({ itemId, quantity }) => ({ itemId, quantity }));
    if (job.type === "registration" && (job.registrationStarterPack || (metadata.type === "registration" && metadata.registrationStarterPack)) &&
        (metadata.type !== "registration" || !job.registrationStarterPack || !isDeepStrictEqual(metadata.registrationStarterPack, job.registrationStarterPack) ||
         !isDeepStrictEqual(metadata.startingItems, job.registrationStarterPack.items) ||
         !isDeepStrictEqual(grantedItems, job.registrationStarterPack.items) ||
         !isDeepStrictEqual(metadata.registrationStarterItemsGranted, grantedItems))) {
      throw new SettlementUncertainError("Registration reward receipt evidence is required before cleanup");
    }
    if (
      metadata.paymentOperationIndex !== value.operationIndex ||
      metadata.type !== value.paymentType ||
      (metadata.type === "registration" &&
        metadata.registrationHiveAmountPaid !== value.basisMilli / 1000) ||
      (metadata.type === "shop_purchase" &&
        (metadata.shopHiveAmountPaid !== value.basisMilli / 1000 ||
          metadata.shopItemId !== value.itemId ||
          metadata.shopKind !== job.shopKind ||
          metadata.shopQuantity !== value.quantity))
    )
      throw new SettlementUncertainError(
        "Referral source receipt identity changed",
      );
    if (job.registrationStarterPack) await markRegistrationStarterArchived(job.signature);
    const due =
      receipt.metadata.referralEligible === true &&
      value.referrer !== null &&
      value.rewardMilli > 0;
    if (due) {
      const label = job.type === "registration" ? "registration" : "shop";
      const key = `referral:${job.signature}`;
      const payout = await dispatchTreasuryTransfer(
        context,
        job.signature,
        key,
        value.referrer!,
        `${Math.floor(value.rewardMilli / 1000)}.${String(value.rewardMilli % 1000).padStart(3, "0")}`,
        "HIVE",
        `Chainframe referral ${label} ${value.source}`,
        value.accountAlias,
        value.from,
      );
      requireConfirmedTransfer(payout);
      // Keyed follow-up writes may retry without re-entering the primary effects.
      await withDatabaseOperation(async () => {
        await context.checkLease();
        const recorded = await createLog({
          settlementKey: key,
          correlationKey: value.source,
          type: "referral",
          wallet: value.referrer!,
          target: value.buyer,
          amount: value.rewardMilli / 1000,
          txHash: payout.transactionId,
          data: {
            currency: "HIVE",
            source: label,
            purchaseBasis: value.basisMilli / 1000,
            quantity: value.quantity,
            ...(value.itemId ? { itemId: value.itemId } : {}),
            paid: true,
          },
        });
        if (
          recorded.wallet !== value.referrer ||
          recorded.target !== value.buyer ||
          recorded.amount !== value.rewardMilli / 1000 ||
          recorded.txHash !== payout.transactionId ||
          recorded.data?.currency !== "HIVE" ||
          recorded.data?.source !== label ||
          recorded.data?.purchaseBasis !== value.basisMilli / 1000 ||
          recorded.data?.quantity !== value.quantity
        )
          throw new SettlementUncertainError("Referral log evidence changed");
        await finishReferralObligation(job.signature, "paid");
      });
    } else await finishReferralObligation(job.signature, "not_due");
    await withDatabaseOperation(async () => {
      await context.checkLease();
      const transfers = await loadTreasuryTransfers(job.signature);
      if (transfers.some((transfer) => transfer.state !== "confirmed"))
        throw new SettlementUncertainError(
          "Unpaid referral evidence requires review",
        );
      await archiveTreasuryTransfers(job.signature, transfers, value);
      await completeJob(String(job._id));
    });
    return true;
  } catch (error) {
    if (error instanceof DatabaseOperationUncertainError) {
      if (error.cause instanceof SettlementUncertainError) throw error.cause;
      // Every follow-up write is keyed or idempotent; primary markers are never cleared here.
      throw new Error(
        "Keyed referral finalization incomplete; retry required",
        { cause: error },
      );
    }
    throw error;
  }
}
