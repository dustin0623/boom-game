import { config } from "@/lib/config/config";
import {
  completePaymentJob,
  withPaymentDatabaseOperation,
  finalizeDead,
  retryOrDie,
} from "@/server/game-smart-contract/features/events/payment-processing/support";

import { parkJob } from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import {
  claimProcessedTransaction,
  getProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";
import { creditHash } from "@/lib/modules/players/server.repository";

import { createLog } from "@/lib/modules/logs/server.repository";
import { verifyTokenPayment } from "@/lib/chains/modules/hive/server/events/verify-token-payment/action";
import { getPaymentTrigger } from "@/lib/utils/game/payment-protocol";
import { classifyPaymentObservation } from "@/server/game-smart-contract/utils/payment";
import { incrementStat } from "@/lib/modules/game-stats/server.repository";

import { logger } from "@/lib/logger.server";

import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";

export async function processDeposit(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  const id = String(job._id);
  const amount = job.depositAmount ?? 0;
  const txId = job.depositTxId ?? job.signature;
  try {
    const verification = await verifyTokenPayment({
      transactionId: txId,
      expected: {
        from: job.walletAddress,
        account: config.blockchain.treasuryAccount,
        symbol: config.blockchain.token,
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
      logger.warn("deposit retry scheduled", {
        wallet: job.walletAddress,
        txId,
      });
      return;
    }
    if (observation === "unconfirmed") {
      await finalizeDead(
        context,
        job,
        "deposit",
        `VERIFICATION_FAILED: ${verification.error ?? "invalid"}`,
      );
      return;
    }

    if (getPaymentTrigger(verification)?.action !== "deposit") {
      await finalizeDead(
        context,
        job,
        "deposit",
        "VERIFICATION_FAILED: payment memo action mismatch",
      );
      return;
    }
    const verifiedAmount = Number(verification.amount);
    if (!Number.isFinite(verifiedAmount) || verifiedAmount !== amount) {
      await finalizeDead(
        context,
        job,
        "deposit",
        "VERIFICATION_FAILED: amount mismatch",
      );
      return;
    }

    await withPaymentDatabaseOperation(job, async () => {
      const existing = await getProcessedTransaction(txId);
      if (existing) {
        await completePaymentJob(job);
        return;
      }
      await creditHash(job.walletAddress, amount);
      await createLog({
        type: "deposit",
        wallet: job.walletAddress,
        amount,
        txHash: txId,
        data: { jobId: id },
      });
      await incrementStat("totalHashDeposited", amount);
      logger.info("settled deposit", {
        wallet: job.walletAddress,
        amount,
        txId,
      });
      await context.checkLease();
      await claimProcessedTransaction({
        txHash: txId,
        wallet: job.walletAddress,
        type: "deposit",
        amount,
        metadata: {
          paymentOperationIndex: job.paymentOperationIndex,
          type: "deposit",
          creditedAmount: amount,
        },
      });
      await completePaymentJob(job);
    });
  } catch (err) {
    await retryOrDie(context, job, "deposit", err);
  }
}
