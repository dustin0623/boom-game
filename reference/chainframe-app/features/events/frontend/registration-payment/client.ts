"use client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { REGISTRATION_FEE_HIVE } from "@/lib/config/constants/game";
import { getMe } from "@/lib/api/client";
import { getHiveTreasuryAccount } from "@/lib/utils/hive/wallet";
import { transferNative } from "@/lib/chains/modules/hive/wallet/events/transfer-native/action";
import type {
  PaymentSessionContext,
  PaymentPhase,
} from "@/features/types/game/payments";
import { PaymentBroadcastUncertain } from "@/lib/utils/hive/payment";
import type { Confirmation } from "@/features/events/frontend/confirm-transaction/client";
import { recordSubmittedTransaction } from "@/features/events/frontend/confirm-transaction/client";
const registrationPayments = new Map<string, string | null>();
export async function payRegistration(
  context: PaymentSessionContext & {
    onPhase: (phase: PaymentPhase) => void;
    confirm: (transactionId: string) => Promise<Confirmation>;
    isRejected: (error: unknown) => boolean;
  },
): Promise<void> {
  const { session, isCurrent, onPhase } = context;
  const address = session.address;
  if (!address || session.mode !== "wallet")
    throw new Error("Connect your wallet first");
  onPhase("confirming-onchain");
  let attemptedTransfer = false;
  const record = (transactionId: string | null) => {
    recordSubmittedTransaction(context, {
      kind: "payment",
      label: `Register player · ${REGISTRATION_FEE_HIVE} HIVE`,
      transactionId,
      type: "registration",
      registered: true,
    });
    if (isCurrent()) context.onSubmitted?.();
  };
  try {
    const before = await getMe();
    if (!isCurrent()) throw new Error("Wallet session changed");
    if (before.ok && before.player?.isRegistered) {
      registrationPayments.delete(address);
      return;
    }
    if (!registrationPayments.has(address)) {
      await requireWorkerReadiness(isCurrent);
      onPhase("awaiting-keychain-approval");
      attemptedTransfer = true;
      const { transactionId } = await transferNative({
        username: address,
        account: getHiveTreasuryAccount(),
        amount: REGISTRATION_FEE_HIVE.toFixed(3),
        symbol: "HIVE",
        action: "registration",
        metadata: {},
      });
      registrationPayments.set(address, transactionId);
      record(transactionId);
    }
    if (!isCurrent()) throw new Error("Wallet session changed");
    onPhase("confirming-onchain");
    const transactionId = registrationPayments.get(address);
    if (!transactionId) throw new PaymentBroadcastUncertain();
    await context.confirm(transactionId);
    if (!isCurrent()) throw new Error("Wallet session changed");
    registrationPayments.delete(address);
  } catch (error) {
    if (error instanceof PaymentBroadcastUncertain) {
      registrationPayments.set(address, null);
      if (attemptedTransfer) record(null);
    }
    if (context.isRejected(error)) registrationPayments.delete(address);
    throw error;
  } finally {
    if (isCurrent()) onPhase("idle");
  }
}
