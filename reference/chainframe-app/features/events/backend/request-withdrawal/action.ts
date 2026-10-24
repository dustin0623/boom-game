import {
  playerRepository,
  reserveWithdrawal,
  getWithdrawalReservation,
} from "@/lib/modules/players/server.repository";

import {
  enqueueWithdrawal,
  setFinancialPhase,
  findPendingBySignature,
  markRecoverableFinancialJob,
} from "@/lib/modules/transactions-pending/server.repository";
import { getProcessedTransaction } from "@/lib/modules/transactions-processed/server.repository";

import { withdrawalCapacity } from "@/features/types/game/economy";
import { gameActionNow } from "@/lib/utils/game/execution-context.server";
import { withDatabaseOperation } from "@/lib/utils/database/operation.server";

/** Called inside the signed processor's unit of work; never broadcasts. */
export async function requestWithdrawal(
  wallet: string,
  amount: number,
  signature: string,
) {
  return withDatabaseOperation(async () => {
    const player = await playerRepository.findByWallet(wallet);
    if (!player || !Number.isSafeInteger(amount) || amount < 1)
      return { ok: false, error: "Invalid withdrawal" };
    const completed = await getProcessedTransaction(signature);
    if (completed) {
      if (
        completed.wallet !== wallet ||
        completed.type !== "withdrawal" ||
        Math.abs(completed.amount) !== amount
      )
        throw new Error("Withdrawal job intent changed");
      if (
        completed.status === "failed" &&
        completed.metadata?.type === "withdrawal" &&
        completed.metadata.reservationAccepted !== true
      )
        return { ok: false, error: completed.error ?? "Withdrawal rejected" };
      return { ok: true, queued: true, signature, amount };
    }
    const job = await enqueueWithdrawal({
      walletAddress: wallet,
      withdrawAmount: amount,
      signature,
      originEventKey: signature.slice("withdrawal:".length),
    });
    // Enable parent replay only after a durable withdrawal journal exists.
    await markRecoverableFinancialJob(signature.slice("withdrawal:".length));
    const prepared = await findPendingBySignature(signature);
    if (!prepared) throw new Error("Withdrawal job changed during recovery");
    if (prepared.financialPhase === "rejected")
      return {
        ok: false,
        error: prepared.financialReason ?? "Withdrawal rejected",
      };
    if (
      prepared.financialPhase === "reserved" ||
      prepared.financialPhase === "refund"
    ) {
      const proof = await getWithdrawalReservation(wallet, signature);
      if (!proof || proof.amount !== amount)
        throw new Error("Missing withdrawal reservation");
      return { ok: true, queued: true, ...job, amount };
    }
    const reservation = await reserveWithdrawal(
      wallet,
      signature,
      amount,
      Math.floor(withdrawalCapacity(player.notoriety)),
      gameActionNow(),
    );
    if (!reservation.ok) {
      await setFinancialPhase(signature, "rejected", reservation.error);
      return reservation;
    }
    await setFinancialPhase(signature, "reserved");
    return { ok: true, queued: true, ...job, amount };
  });
}
