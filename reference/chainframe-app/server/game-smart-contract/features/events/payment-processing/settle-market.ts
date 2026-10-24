import {
  markJobRefunded,
  parkJob,
  setMarketSettlement,
  setFinancialPhase,
} from "@/lib/modules/transactions-pending/server.repository";
import {
  loadTreasuryTransfers,
  completePaymentJob,
  withPaymentDatabaseOperation,
  finalizeDead,
  retryOrDie,
} from "@/server/game-smart-contract/features/events/payment-processing/support";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import {
  insertProcessedTransaction,
  getProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";
import {
  findEquipmentById,
  reserveMarketPurchase,
  finishMarketPurchase,
  releaseMarketPurchase,
} from "@/lib/modules/equipments/server.repository";
import { createLog } from "@/lib/modules/logs/server.repository";
import { findPlayerByWallet } from "@/lib/modules/players/server.repository";
import { verifyNativePayment } from "@/lib/chains/modules/hive/server/events/verify-native-payment/action";
import { getPaymentTrigger } from "@/lib/utils/game/payment-protocol";
import {
  getMarketAmounts,
  hiveAmountSchema,
  toHiveQuantity,
} from "@/lib/utils/game/pricing";
import { quantitiesEqual } from "hivexph-sdk";
import { incrementSettlementStat } from "@/lib/modules/game-stats/server.repository";
import { config } from "@/lib/config/config";
import { dispatchTreasuryTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch";
import { requireConfirmedTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { prepareMarketFee, settleMarketFee } from "./market-fee";
import { SettlementUncertainError } from "@/server/game-smart-contract/features/events/treasury/errors.server";

export async function processMarketPurchase(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  const ref = job.paymentTxId ?? job.signature;
  const itemId = job.itemId ?? "";
  try {
    if (
      (job.marketFeePolicyVersion !== undefined &&
        job.marketFeePolicyVersion !== 1) ||
      (job.marketFeePolicyVersion === undefined &&
        (job.marketFeeObligation ||
          job.marketFeeStatus !== undefined ||
          job.marketFeeTreasuryAccount !== undefined))
    )
      throw new SettlementUncertainError("Unsupported marketplace fee policy");
    const receipt = await getProcessedTransaction(ref);
    if (receipt) {
      if (job.marketFeePolicyVersion === 1 && receipt.status === "success")
        await settleMarketFee(context, job);
      else await completePaymentJob(job);
      return;
    }
    if (
      job.paymentCurrency !== "HIVE" ||
      !job.paymentAccount ||
      job.paymentAccount !== config.blockchain.marketAccount
    ) {
      await parkJob(
        String(job._id),
        "Missing or changed marketplace routing requires operator review",
      );
      return;
    }
    if (!hiveAmountSchema.safeParse(job.price).success) {
      await parkJob(
        String(job._id),
        "Invalid marketplace HIVE price requires operator review",
      );
      return;
    }
    if (job.financialWorkflowVersion !== 1) {
      await parkJob(
        String(job._id),
        "Unsupported marketplace workflow evidence requires operator review",
      );
      return;
    }
    if (job.financialPhase === "refund") {
      await refund(context, job, job.financialReason ?? "Listing unavailable");
      return;
    }
    const payment = await verifyNativePayment({
      transactionId: ref,
      expected: {
        from: job.walletAddress,
        account: job.paymentAccount,
        symbol: "HIVE",
      },
    });
    if (payment.status === "pending") return;
    if (
      payment.operationIndex !== job.paymentOperationIndex &&
      job.paymentOperationIndex !== undefined
    ) {
      await parkJob(
        String(job._id),
        "Payment operation mismatch; indexed reconciliation required",
      );
      return;
    }
    const trigger = getPaymentTrigger(payment);
    if (
      !payment.success ||
      payment.transactionId !== ref ||
      payment.from !== job.walletAddress ||
      payment.to !== job.paymentAccount ||
      payment.symbol !== "HIVE" ||
      trigger?.action !== "market_purchase" ||
      trigger.metadata.itemId !== itemId ||
      !hiveAmountSchema.safeParse(Number(payment.amount)).success ||
      !quantitiesEqual(payment.amount, toHiveQuantity(job.price!))
    ) {
      await finalizeDead(
        context,
        job,
        "market",
        "VERIFICATION_FAILED: market payment intent mismatch",
      );
      return;
    }
    await context.checkLease();
    const prepared = await withPaymentDatabaseOperation(job, async () => {
      await context.checkLease();
      const item = await findEquipmentById(itemId);
      if (item?.purchaseReservation?.key === job.signature)
        return { reservation: item.purchaseReservation };
      // Saved settlement/payout evidence cannot be reinterpreted as a new
      // ineligible purchase if its item reservation is unexpectedly missing.
      if (
        job.marketSettlement ||
        job.marketFeeObligation ||
        job.treasuryTransfers?.some(
          (intent) => intent.key === `market-sale:${job.signature}`,
        )
      )
        return { review: true };
      const buyer = await findPlayerByWallet(job.walletAddress);
      if (buyer?.isRegistered !== true)
        return { rejection: "Player registration is required." };
      if (
        !item?.market?.isMarket ||
        item.market.currency !== "HIVE" ||
        !item.owner ||
        item.owner === job.walletAddress ||
        item.market.price !== job.price
      )
        return { rejection: "Listing unavailable or price changed" };
      const { fee, proceeds } = getMarketAmounts(job.price!);
      return {
        reservation:
          (await reserveMarketPurchase(itemId, {
            key: job.signature,
            buyer: job.walletAddress,
            seller: item.owner,
            price: job.price,
            currency: "HIVE",
            fee,
            proceeds,
            name: item.name,
            rarity: item.rarity,
            listedAt: item.market.listedAt,
            state: "reserved",
          })) ?? undefined,
      };
    });
    if (prepared.review) {
      await parkJob(
        String(job._id),
        "Missing marketplace reservation with existing settlement evidence",
      );
      return;
    }
    const reservation = prepared.reservation;
    if (!reservation) {
      await beginRefund(
        context,
        job,
        prepared.rejection ?? "Listing unavailable or price changed",
      );
      return;
    }
    if (
      reservation.buyer !== job.walletAddress ||
      reservation.currency !== "HIVE" ||
      reservation.price !== job.price ||
      reservation.state === "refunded"
    ) {
      await parkJob(String(job._id), "Marketplace reservation mismatch");
      return;
    }
    await setMarketSettlement(String(job._id), reservation);
    job.marketSettlement = reservation;
    if (job.marketFeePolicyVersion === 1) await prepareMarketFee(job);
    const payout = await dispatchTreasuryTransfer(
      context,
      job.signature,
      `market-sale:${job.signature}`,
      reservation.seller,
      toHiveQuantity(reservation.proceeds),
      "HIVE",
      `Chainframe marketplace sale ${ref}`,
      "market",
      job.paymentAccount,
    );
    if (payout.status === "pending") return;
    if (payout.status === "failed") {
      await beginRefund(context, job, "Seller payment execution failed");
      return;
    }
    requireConfirmedTransfer(payout);
    await withPaymentDatabaseOperation(job, async () => {
      await context.checkLease();
      await finishMarketPurchase(itemId, job.signature);
      await createLog({
        settlementKey: `market:${job.signature}`,
        type: "market",
        wallet: job.walletAddress,
        target: reservation.seller,
        amount: -reservation.price,
        txHash: ref,
        data: {
          action: "bought",
          currency: "HIVE",
          itemId,
          price: reservation.price,
          fee: reservation.fee,
          sellerProceeds: reservation.proceeds,
          name: reservation.name,
          rarity: reservation.rarity,
        },
      });
      await incrementSettlementStat("totalMarketSales", job.signature);
      await context.checkLease();
      await insertProcessedTransaction({
        txHash: ref,
        wallet: job.walletAddress,
        type: "market_purchase",
        amount: -reservation.price,
        metadata: {
          paymentOperationIndex: job.paymentOperationIndex,
          type: "market_purchase",
          currency: "HIVE",
          itemId,
          itemType: job.itemType ?? "item",
          seller: reservation.seller,
          price: reservation.price,
          fee: reservation.fee,
          ...(job.marketFeePolicyVersion === 1
            ? {
                marketFeePolicyVersion: 1,
                marketFeeObligation: job.marketFeeObligation,
                marketFeeStatus: "pending" as const,
              }
            : {}),
        },
      });
      if (job.marketFeePolicyVersion !== 1) await completePaymentJob(job);
    });
    if (job.marketFeePolicyVersion === 1) await settleMarketFee(context, job);
  } catch (error) {
    await retryOrDie(context, job, "market", error);
  }
}

async function beginRefund(
  context: SettlementContext,
  job: IInboundTransaction,
  reason: string,
) {
  await setFinancialPhase(job.signature, "refund", reason);
  job.financialPhase = "refund";
  job.financialReason = reason;
  await refund(context, job, reason);
}

async function refund(
  context: SettlementContext,
  job: IInboundTransaction,
  reason: string,
) {
  const ref = job.paymentTxId ?? job.signature;
  const payout = await dispatchTreasuryTransfer(
    context,
    job.signature,
    `refundMarketPurchase:${job.signature}`,
    job.walletAddress,
    toHiveQuantity(job.price!),
    "HIVE",
    `Chainframe marketplace refund ${ref}`,
    "market",
    job.paymentAccount,
  );
  requireConfirmedTransfer(payout);
  await withPaymentDatabaseOperation(job, async () => {
    await context.checkLease();
    await releaseMarketPurchase(job.itemId!, job.signature);
    await createLog({
      settlementKey: `market-refund:${job.signature}`,
      type: "market",
      wallet: job.walletAddress,
      amount: job.price!,
      txHash: payout.transactionId,
      data: {
        action: "refunded",
        currency: "HIVE",
        itemId: job.itemId,
        reason,
        jobId: String(job._id),
      },
    });
    await markJobRefunded(job.signature);
    job.refunded = true;
    await insertProcessedTransaction({
      txHash: `refund:${ref}`,
      wallet: job.walletAddress,
      type: "market_purchase",
      amount: job.price!,
      metadata: {
        treasuryTransfers: await loadTreasuryTransfers(job.signature),
        paymentOperationIndex: job.paymentOperationIndex,
        type: "market_purchase",
        currency: "HIVE",
        itemId: job.itemId!,
        itemType: job.itemType ?? "item",
        seller: "refund",
        price: job.price!,
        fee: 0,
      },
    });
    await finalizeDead(context, job, "market", reason);
  });
}
