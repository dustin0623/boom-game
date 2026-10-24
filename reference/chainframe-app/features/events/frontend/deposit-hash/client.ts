"use client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { transferToken } from "@/lib/chains/modules/hive/wallet/events/transfer-token/action";
import { getHiveTreasuryAccount } from "@/lib/utils/hive/wallet";
import type { PaymentSessionContext } from "@/features/types/game/payments";
import {
  recordSubmittedTransaction,
  claimSubmission,
  releaseSubmission,
} from "@/features/events/frontend/confirm-transaction/client";
import { PaymentBroadcastUncertain } from "@/lib/utils/hive/payment";
export async function depositHash(
  amount: number,
  context: PaymentSessionContext,
) {
  const { session, isCurrent } = context;
  if (!session.address || session.mode !== "wallet" || !isCurrent())
    throw new Error("Sign in with Hive Keychain before depositing");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid amount");
  await requireWorkerReadiness(isCurrent);
  const lock = claimSubmission(context, "deposit-signing");
  if (!lock) throw new Error("A deposit is already awaiting Keychain approval");
  const submitted = (transactionId: string | null) => {
    recordSubmittedTransaction(context, {
      kind: "payment",
      label: `Deposit ${amount} HASH`,
      transactionId,
      type: "deposit",
    });
    if (isCurrent()) context.onSubmitted?.();
  };
  try {
    const result = await transferToken({
      username: session.address,
      account: getHiveTreasuryAccount(),
      symbol: "HASH",
      quantity: amount.toFixed(3),
      action: "deposit",
      metadata: {},
    });
    submitted(result.transactionId);
    return isCurrent() ? result : null;
  } catch (error) {
    if (error instanceof PaymentBroadcastUncertain) submitted(null);
    throw error;
  } finally {
    releaseSubmission(lock);
  }
}
