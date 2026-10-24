import { refundNativePayment } from "./refund-native";
import { prepareNativeReferral, settleNativeReferral } from "./referral-native";
import {
  withPaymentDatabaseOperation,
  finalizeDead,
  retryOrDie,
} from "@/server/game-smart-contract/features/events/payment-processing/support";
import { playerRepository } from "@/lib/modules/players/server.repository";

import { parkJob } from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import {
  claimProcessedTransaction,
  getProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";

import { grantPurchasedItems } from "@/features/events/backend/purchase-item/action";
import { toMilliHive, getShopHiveAmount } from "@/lib/utils/game/pricing";
import { isConsumableId } from "@/features/types/game/consumables";
import { EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import { verifyNativePayment } from "@/lib/chains/modules/hive/server/events/verify-native-payment/action";
import { getPaymentTrigger } from "@/lib/utils/game/payment-protocol";
import { classifyPaymentObservation } from "@/server/game-smart-contract/utils/payment";
import { config } from "@/lib/config/config";

import { logger } from "@/lib/logger.server";

import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";

export async function processShopPurchase(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  const id = String(job._id);
  const txId = job.paymentTxId ?? job.signature;
  const required = job.shopHiveAmount ?? 0;
  const itemId = job.shopItemId ?? "";
  const quantity = job.shopQuantity ?? 1;
  if (job.shopFulfillment !== "inventory") {
    await parkJob(
      id,
      "Shop inventory fulfillment evidence is required; operator review required",
    );
    return;
  }
  const expected = job.shopKind
    ? getShopHiveAmount(job.shopKind, itemId, quantity)
    : null;
  if (expected === null || expected !== required) {
    await parkJob(
      id,
      "Invalid shop inventory purchase evidence; operator review required",
    );
    return;
  }
  try {
    if (job.referralPolicyVersion !== 1) {
      await parkJob(
        id,
        "Shop referral policy evidence is required; operator review required",
      );
      return;
    }
    if (await settleNativeReferral(context, job)) return;
    const verification = await verifyNativePayment({
      transactionId: txId,
      expected: {
        from: job.walletAddress,
        account: config.blockchain.treasuryAccount,
        symbol: "HIVE",
      },
    });
    const observation = classifyPaymentObservation(
      verification,
      job.paymentOperationIndex,
    );
    if (observation === "operation-mismatch") {
      await parkJob(
        id,
        "Payment operation mismatch; indexed reconciliation required",
      );
      return;
    }
    if (observation === "pending") {
      // Chain/engine confirmation delays do not consume the failure budget.
      logger.warn("shop purchase retry scheduled", {
        wallet: job.walletAddress,
        txId,
      });
      return;
    }
    if (observation === "unconfirmed") {
      await finalizeDead(
        context,
        job,
        "shop",
        `VERIFICATION_FAILED: ${verification.error ?? "invalid"}`,
      );
      return;
    }
    if (verification.to !== config.blockchain.treasuryAccount) {
      await finalizeDead(
        context,
        job,
        "shop",
        "VERIFICATION_FAILED: wrong recipient",
      );
      return;
    }
    if (verification.from !== job.walletAddress) {
      await finalizeDead(
        context,
        job,
        "shop",
        "VERIFICATION_FAILED: sender mismatch",
      );
      return;
    }

    const trigger = getPaymentTrigger(verification);
    if (trigger?.action !== "shop_purchase") {
      await finalizeDead(
        context,
        job,
        "shop_purchase",
        "VERIFICATION_FAILED: payment memo action mismatch",
      );
      return;
    }
    const intent = trigger.metadata;
    if (
      intent.kind !== job.shopKind ||
      intent.itemId !== itemId ||
      intent.quantity !== quantity
    ) {
      await finalizeDead(
        context,
        job,
        "shop",
        "VERIFICATION_FAILED: shop memo mismatch",
      );
      return;
    }
    const paidAmount = Number(verification.amount);
    if (!Number.isFinite(paidAmount)) {
      await finalizeDead(
        context,
        job,
        "shop",
        "VERIFICATION_FAILED: unreadable amount",
      );
      return;
    }
    if (
      !(await playerRepository.findByWallet(job.walletAddress))?.isRegistered
    ) {
      await refundNativePayment(
        context,
        job,
        paidAmount,
        "Registration is required",
      );
      await finalizeDead(
        context,
        job,
        "shop",
        "Registration is required; refund required",
      );
      return;
    }
    if (
      required <= 0 ||
      paidAmount <= 0 ||
      toMilliHive(paidAmount) !== toMilliHive(required)
    ) {
      const reason = `amount ${paidAmount.toFixed(3)} HIVE does not match the price of ${required.toFixed(3)} HIVE; refund required`;
      await refundNativePayment(context, job, paidAmount, reason);
      await finalizeDead(context, job, "shop", reason);
      return;
    }

    await prepareNativeReferral(job, paidAmount);
    await withPaymentDatabaseOperation(job, async () => {
      const existing = await getProcessedTransaction(txId);
      if (existing) {
        return;
      }
      await grantShopPurchase(job, txId, required, itemId, quantity);
      await context.checkLease();
      await claimProcessedTransaction({
        txHash: txId,
        wallet: job.walletAddress,
        type: "shop_purchase",
        amount: required,
        metadata: {
          paymentOperationIndex: job.paymentOperationIndex,
          type: "shop_purchase",
          shopKind: job.shopKind ?? "consumable",
          shopItemId: itemId,
          shopQuantity: quantity,
          shopHiveAmount: required,
          shopHiveAmountPaid: paidAmount,
          referralPolicyVersion: 1,
          referralEligible: true,
        },
      });
    });
    await settleNativeReferral(context, job);
    logger.info("settled shop purchase", {
      wallet: job.walletAddress,
      itemId,
      quantity,
      txId,
    });
  } catch (err) {
    await retryOrDie(context, job, "shop", err);
  }
}

async function grantShopPurchase(
  job: IInboundTransaction,
  txId: string,
  hiveAmount: number,
  itemId: string,
  quantity: number,
): Promise<void> {
  let unitPrice: number;
  if (job.shopKind === "chest" && itemId === EQUIPMENT_CHEST_ID)
    unitPrice = getShopHiveAmount("chest", itemId, 1)!;
  else if (job.shopKind === "consumable" && isConsumableId(itemId))
    unitPrice = getShopHiveAmount("consumable", itemId, 1)!;
  else throw new Error("Unknown shop item");
  await grantPurchasedItems(
    job.walletAddress,
    itemId as import("@/features/types/game/inventory").InventoryItemId,
    quantity,
    { paidWith: "hive", amountCharged: hiveAmount, unitPrice, txHash: txId },
  );
  await playerRepository.touchSink(job.walletAddress);
}
