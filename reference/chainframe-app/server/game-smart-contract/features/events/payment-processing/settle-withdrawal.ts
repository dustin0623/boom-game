import {
  completePaymentJob,
  finalizeDead,
  retryOrDie,
  withPaymentDatabaseOperation,
} from "@/server/game-smart-contract/features/events/payment-processing/support";
import {
  markJobRefunded,
  setFinancialPhase,
  parkJob,
} from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import {
  insertProcessedTransaction,
  getProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";
import {
  getWithdrawalReservation,
  refundWithdrawalReservation,
} from "@/lib/modules/players/server.repository";
import { createLog } from "@/lib/modules/logs/server.repository";
import { incrementSettlementStat } from "@/lib/modules/game-stats/server.repository";
import { dispatchWithdrawalPayout } from "@/server/game-smart-contract/features/events/treasury/withdrawal-payout";
import { requireConfirmedTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import { requestWithdrawal } from "@/features/events/backend/request-withdrawal/action";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";

export async function processWithdrawal(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  try {
    if (await getProcessedTransaction(job.signature)) {
      await completePaymentJob(job);
      return;
    }
    if (job.financialWorkflowVersion !== 1) {
      await parkJob(
        String(job._id),
        "Unsupported withdrawal reservation requires operator review",
      );
      return;
    }
    if (
      job.withdrawalPayoutPolicyVersion !== undefined &&
      job.withdrawalPayoutPolicyVersion !== 1
    ) {
      await parkJob(
        String(job._id),
        "Unsupported withdrawal payout policy requires operator review",
      );
      return;
    }
    if (job.financialPhase === "prepared") {
      await context.checkLease();
      const result = await requestWithdrawal(
        job.walletAddress,
        job.withdrawAmount!,
        job.signature,
      );
      if (!result.ok) {
        job.financialPhase = "rejected";
        await finalizeDead(
          context,
          job,
          "withdrawal",
          ("error" in result ? result.error : undefined) ??
            "Withdrawal rejected",
        );
        return;
      }
      job.financialPhase = "reserved";
    }
    if (job.financialPhase === "rejected") {
      await finalizeDead(
        context,
        job,
        "withdrawal",
        job.financialReason ?? "Withdrawal rejected",
      );
      return;
    }
    const reservation = await getWithdrawalReservation(
      job.walletAddress,
      job.signature,
    );
    if (!reservation || reservation.amount !== job.withdrawAmount) {
      await parkJob(
        String(job._id),
        "Missing or mismatched withdrawal reservation",
      );
      return;
    }
    if (job.financialPhase === "refund" || reservation.state === "refunded") {
      await compensate(context, job);
      return;
    }
    if (job.financialPhase !== "reserved") {
      await parkJob(String(job._id), "Unproven withdrawal activation");
      return;
    }
    const payout = await dispatchWithdrawalPayout(context, job);
    if (payout.status === "pending") return;
    if (payout.status === "failed") {
      await setFinancialPhase(
        job.signature,
        "refund",
        "Treasury execution failed",
      );
      job.financialPhase = "refund";
      await compensate(context, job);
      return;
    }
    requireConfirmedTransfer(payout);
    await withPaymentDatabaseOperation(job, async () => {
      await context.checkLease();
      await createLog({
        settlementKey: `withdrawal:${job.signature}`,
        type: "withdrawal",
        wallet: job.walletAddress,
        amount: -job.withdrawAmount!,
        txHash: payout.transactionId,
        correlationKey: job.signature,
        data: { jobId: String(job._id), payoutTxHash: payout.transactionId },
      });
      await incrementSettlementStat(
        "totalHashWithdrawn",
        job.signature,
        job.withdrawAmount!,
      );
      await context.checkLease();
      await insertProcessedTransaction({
        txHash: job.signature,
        wallet: job.walletAddress,
        type: "withdrawal",
        amount: -job.withdrawAmount!,
        metadata: {
          paymentOperationIndex: job.paymentOperationIndex,
          type: "withdrawal",
          payoutTxHash: payout.transactionId!,
        },
      });
      await completePaymentJob(job);
    });
  } catch (error) {
    await retryOrDie(context, job, "withdrawal", error);
  }
}

async function compensate(
  context: SettlementContext,
  job: IInboundTransaction,
) {
  await withPaymentDatabaseOperation(job, async () => {
    await context.checkLease();
    await refundWithdrawalReservation(job.walletAddress, job.signature);
    await markJobRefunded(job.signature);
    await createLog({
      settlementKey: `withdrawal-refund:${job.signature}`,
      type: "withdrawal",
      wallet: job.walletAddress,
      amount: job.withdrawAmount!,
      data: {
        jobId: String(job._id),
        refunded: true,
        reason: "Treasury execution failed",
      },
    });
    job.refunded = true;
    await finalizeDead(
      context,
      job,
      "withdrawal",
      "Treasury execution failed; reserved HASH restored",
    );
  });
}
