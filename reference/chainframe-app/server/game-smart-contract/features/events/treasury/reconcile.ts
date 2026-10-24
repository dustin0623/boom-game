import {
  getPendingTreasuryTransfer,
  recordTreasuryVerification,
  resumeReconciledPayment,
} from "@/lib/modules/transactions-pending/server.repository";
import { getArchivedTreasuryTransfer } from "@/lib/modules/transactions-processed/server.repository";
import { verifyTreasuryTransfer } from "@/server/game-smart-contract/features/events/treasury/verify.server";
export async function reconcileTreasurySettlement(
  jobSignature: string,
  key: string,
  transactionId: string,
): Promise<void> {
  const pending = await getPendingTreasuryTransfer(jobSignature, key);
  const record = pending ?? (await getArchivedTreasuryTransfer(key));
  if (!record) throw new Error("Unknown treasury intent");
  if (record.transactionId && record.transactionId !== transactionId)
    throw new Error("Treasury intent already has a different transaction");
  const result = await verifyTreasuryTransfer(
    record.intent,
    transactionId,
    record.operationIndex,
  );
  if (result.status === "pending") throw new Error("Transfer is not final");
  if (!pending) return;
  await recordTreasuryVerification(
    jobSignature,
    key,
    transactionId,
    result.evidence,
  );
  await resumeReconciledPayment(jobSignature);
}
