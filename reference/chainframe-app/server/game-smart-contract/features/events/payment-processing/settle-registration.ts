import { isDeepStrictEqual } from "node:util";
import { registrationStarterItems } from "@/features/types/game/inventory";
import { SettlementUncertainError } from "@/server/game-smart-contract/features/events/treasury/errors.server";
import { refundNativePayment } from "./refund-native";
import { prepareNativeReferral, settleNativeReferral } from "./referral-native";
import {
  withPaymentDatabaseOperation,
  finalizeDead,
  retryOrDie,
  errorCode,
} from "@/server/game-smart-contract/features/events/payment-processing/support";
import { playerRepository } from "@/lib/modules/players/server.repository";

import { captureRegistrationStarterPack, recordRegistrationStarterGrant, parkJob } from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import {
  claimProcessedTransaction,
  getProcessedTransaction,
} from "@/lib/modules/transactions-processed/server.repository";
import { registerPlayer } from "@/features/events/backend/player-lifecycle/register";

import { createLog } from "@/lib/modules/logs/server.repository";
import { verifyNativePayment } from "@/lib/chains/modules/hive/server/events/verify-native-payment/action";
import { getPaymentTrigger } from "@/lib/utils/game/payment-protocol";
import { classifyPaymentObservation } from "@/server/game-smart-contract/utils/payment";
import {
  REGISTRATION_FEE_HIVE,
  REGISTRATION_STARTER_EVENT_ID,
  REGISTRATION_STARTER_STARTS_AT,
  REGISTRATION_STARTER_ENDS_AT,
} from "@/lib/config/constants/game";
import { incrementStat } from "@/lib/modules/game-stats/server.repository";
import { config } from "@/lib/config/config";

import { logger } from "@/lib/logger.server";

import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";

export async function processRegistration(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  const id = String(job._id);
  const txId = job.depositTxId ?? job.signature;
  const lockedAmount = job.registrationHiveAmount ?? REGISTRATION_FEE_HIVE;
  try {
    if (job.referralPolicyVersion !== 1) {
      await parkJob(
        id,
        "Registration referral policy evidence is required; operator review required",
      );
      return;
    }
    if (await settleNativeReferral(context, job)) return;
    const verification = await verifyNativePayment({
      transactionId: txId,
      includeBlockTimestamp: true,
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
      logger.warn("registration retry scheduled", {
        wallet: job.walletAddress,
        txId,
      });
      return;
    }
    if (observation === "unconfirmed") {
      await finalizeDead(
        context,
        job,
        "registration",
        `VERIFICATION_FAILED: ${verification.error ?? "invalid"}`,
      );
      return;
    }
    if (verification.to !== config.blockchain.treasuryAccount) {
      await finalizeDead(
        context,
        job,
        "registration",
        "VERIFICATION_FAILED: wrong recipient",
      );
      return;
    }
    if (verification.from !== job.walletAddress) {
      await finalizeDead(
        context,
        job,
        "registration",
        "VERIFICATION_FAILED: sender mismatch",
      );
      return;
    }

    if (getPaymentTrigger(verification)?.action !== "registration") {
      await finalizeDead(
        context,
        job,
        "registration",
        "VERIFICATION_FAILED: payment memo action mismatch",
      );
      return;
    }
    const paidAmount = Number(verification.amount);
    if (!Number.isFinite(paidAmount)) {
      await finalizeDead(
        context,
        job,
        "registration",
        "VERIFICATION_FAILED: unreadable amount",
      );
      return;
    }

    const registered = await playerRepository.findByWallet(job.walletAddress);
    if (registered?.isRegistered && registered.registrationTxId !== txId) {
      await refundNativePayment(
        context,
        job,
        paidAmount,
        "Player is already registered",
      );
      await finalizeDead(
        context,
        job,
        "registration",
        "Already registered; duplicate fee refund required",
      );
      return;
    }

    // Hive amounts carry 3 decimals; half a unit absorbs float noise only.
    if (Math.abs(paidAmount - lockedAmount) > 0.0005) {
      const reason = `amount ${paidAmount.toFixed(3)} HIVE does not match the fixed fee of ${lockedAmount.toFixed(3)} HIVE; refund required`;
      await refundNativePayment(context, job, paidAmount, reason);
      await finalizeDead(context, job, "registration", reason);
      return;
    }

    if (job.databaseEffectsStarted || job.registrationStarterItemsGranted?.length || job.financialWorkflowVersion !== undefined || registered?.isRegistered) {
      throw new SettlementUncertainError("Registration effects already exist; operator review required");
    }
    const paymentTime = verification.blockTimestamp
      ? Date.parse(verification.blockTimestamp.endsWith("Z") ? verification.blockTimestamp : verification.blockTimestamp + "Z") : NaN;
    if (!Number.isFinite(paymentTime) || !Number.isSafeInteger(verification.blockNumber) || verification.blockNumber! < 1 ||
        !Number.isSafeInteger(job.paymentOperationIndex) || job.paymentOperationIndex! < 0)
      throw new SettlementUncertainError("Verified registration payment time and identity are required");
    const decision: NonNullable<IInboundTransaction["registrationStarterPack"]> = {
      version: 1, eventId: REGISTRATION_STARTER_EVENT_ID,
      transactionId: txId, wallet: job.walletAddress, operationIndex: job.paymentOperationIndex!,
      blockNumber: verification.blockNumber!, paymentTime,
      startsAt: REGISTRATION_STARTER_STARTS_AT, endsAt: REGISTRATION_STARTER_ENDS_AT,
      items: registrationStarterItems(paymentTime),
    };
    if (job.registrationStarterPack && !isDeepStrictEqual(job.registrationStarterPack, decision))
      throw new SettlementUncertainError("Saved registration reward decision changed");
    const captured = await captureRegistrationStarterPack(job.signature, decision);
    if (!isDeepStrictEqual(captured, decision)) throw new SettlementUncertainError("Registration reward decision mismatch");
    job.registrationStarterPack = captured;
    await prepareNativeReferral(job, paidAmount);
    try {
      await withPaymentDatabaseOperation(job, async () => {
        const existing = await getProcessedTransaction(txId);
        if (existing) {
          return;
        }
        const current = await playerRepository.findByWallet(job.walletAddress);
        if (current?.isRegistered && current.registrationTxId !== txId)
          throw Object.assign(new Error("Player is already registered"), {
            code: "DUPLICATE_REGISTRATION",
          });
        const awards = await registerPlayer(job.walletAddress, txId, captured.items, async (award) => {
          await recordRegistrationStarterGrant(job.signature, award);
          job.registrationStarterItemsGranted ??= [];
          job.registrationStarterItemsGranted.push({ ...award });
        });
        if (!awards.changed) throw new SettlementUncertainError("Competing registration requires operator review");
        const { startingHash, startingItems } = awards;
        if (!isDeepStrictEqual(startingItems, captured.items)) throw new SettlementUncertainError("Incomplete registration starter grant");
        await createLog({
          type: "registration",
          wallet: job.walletAddress,
          amount: lockedAmount,
          txHash: txId,
          data: { jobId: id, paidAmount, startingHash, startingItems },
        });
        await incrementStat("registeredPlayersPaid");
        logger.info("settled registration", {
          wallet: job.walletAddress,
          paidAmount,
          txId,
        });
        await context.checkLease();
        await claimProcessedTransaction({
          txHash: txId,
          wallet: job.walletAddress,
          type: "registration",
          amount: lockedAmount,
          metadata: {
            paymentOperationIndex: job.paymentOperationIndex,
            type: "registration",
            registrationHiveAmount: lockedAmount,
            registrationHiveAmountPaid: paidAmount,
            startingHash,
            startingItems,
            registrationStarterPack: captured,
            registrationStarterItemsGranted: startingItems,
            referralPolicyVersion: 1,
            referralEligible: awards.changed,
          },
        });
      });
    } catch (error) {
      if (errorCode(error) !== "DUPLICATE_REGISTRATION") throw error;
      await refundNativePayment(
        context,
        job,
        paidAmount,
        "Player is already registered",
      );
      await finalizeDead(
        context,
        job,
        "registration",
        "Already registered; duplicate fee refund required",
      );
      return;
    }
    await settleNativeReferral(context, job);
  } catch (err) {
    await retryOrDie(context, job, "registration", err);
  }
}
