import { REGISTRATION_FEE_HIVE } from "@/lib/config/constants/game";
import {
  createLog,
  createErrorLog,
} from "@/lib/modules/logs/server.repository";
import { markJobRefunded } from "@/lib/modules/transactions-pending/server.repository";
import {
  getProcessedTransaction,
  insertProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import type { ProcessedTxMetadata } from "@/lib/modules/transactions-processed/server.types";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { dispatchTreasuryTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch";
import { requireConfirmedTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import {
  TreasuryPendingError,
  SettlementUncertainError,
} from "@/server/game-smart-contract/features/events/treasury/errors.server";
import {
  loadTreasuryTransfers,
  withPaymentDatabaseOperation,
  message,
} from "./support";
import { logger } from "@/lib/logger.server";

/** Registration/shop HIVE refunds share execution, not marketplace recovery policy. */
export async function refundNativePayment(
  context: SettlementContext,
  job: IInboundTransaction,
  amount: number,
  reason: string,
): Promise<void> {
  if (amount <= 0 || job.refunded) return;
  if (job.type !== "registration" && job.type !== "shop_purchase")
    throw new Error("Unsupported native refund job");
  const registration = job.type === "registration";
  const wallet = job.walletAddress;
  const ref =
    (registration ? job.depositTxId : job.paymentTxId) ?? job.signature;
  const key = `${registration ? "refundRegistration" : "refundShopPurchase"}:${job.signature}`;
  const label = registration ? "registration" : "shop";
  try {
    const refund = await dispatchTreasuryTransfer(
      context,
      job.signature,
      key,
      wallet,
      amount.toFixed(3),
      "HIVE",
      `Chainframe ${label} refund ${ref}`,
    );
    requireConfirmedTransfer(refund);
    await withPaymentDatabaseOperation(job, async () => {
      if (await getProcessedTransaction(`refund:${ref}`)) {
        await markJobRefunded(job.signature);
        return;
      }
      const treasuryTransfers = await loadTreasuryTransfers(job.signature);
      await createLog({
        type: label,
        wallet,
        amount,
        txHash: refund.transactionId,
        data: { action: "refunded", reason, jobId: String(job._id) },
      });
      await markJobRefunded(job.signature);
      await context.checkLease();
      const metadata: ProcessedTxMetadata = registration
        ? {
            treasuryTransfers,
            paymentOperationIndex: job.paymentOperationIndex,
            type: "registration",
            registrationHiveAmount:
              job.registrationHiveAmount ?? REGISTRATION_FEE_HIVE,
            registrationHiveAmountPaid: amount,
          }
        : {
            treasuryTransfers,
            paymentOperationIndex: job.paymentOperationIndex,
            type: "shop_purchase",
            shopKind: job.shopKind ?? "consumable",
            shopItemId: job.shopItemId ?? "",
            shopQuantity: job.shopQuantity ?? 1,
            shopHiveAmount: job.shopHiveAmount ?? 0,
            shopHiveAmountPaid: amount,
          };
      await insertProcessedTransaction({
        txHash: `refund:${ref}`,
        wallet,
        type: job.type,
        amount,
        metadata,
      });
    });
    job.refunded = true;
    logger.warn(
      registration ? "refunded registration payment" : "refunded shop purchase",
      { wallet, amount, reason },
    );
  } catch (error) {
    if (error instanceof TreasuryPendingError) throw error;
    await createErrorLog({
      type: label,
      wallet,
      error: `REFUND_FAILED: ${message(error)}`,
      data: { jobId: String(job._id), amount, reason },
    });
    logger.error(`${label} refund requires reconciliation`, {
      wallet,
      amount,
      reason,
    });
    throw new SettlementUncertainError(key, { cause: error });
  }
}
