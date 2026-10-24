"use client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { transferNative } from "@/lib/chains/modules/hive/wallet/events/transfer-native/action";
import { getHiveMarketAccount } from "@/lib/utils/hive/wallet";
import { hiveAmountSchema, toHiveQuantity } from "@/lib/utils/game/pricing";
import type { PaymentSessionContext } from "@/features/types/game/payments";
import {
  recordSubmittedTransaction,
  claimSubmission,
  releaseSubmission,
} from "@/features/events/frontend/confirm-transaction/client";
import { PaymentBroadcastUncertain } from "@/lib/utils/hive/payment";
import { useAuthStore } from "@/features/stores/authStore";
export async function purchaseMarketItem(
  itemId: string,
  price: number,
  context: PaymentSessionContext,
) {
  const { session, isCurrent } = context;
  if (!session.address || session.mode !== "wallet" || !isCurrent())
    throw new Error("Sign in with Hive Keychain before buying");
  if (!hiveAmountSchema.safeParse(price).success)
    throw new Error("Invalid amount");
  const requireRegisteredSession = () => {
    const current = useAuthStore.getState();
    if (
      !isCurrent() ||
      current.mode !== "wallet" ||
      current.apiConnected !== true ||
      current.address !== session.address ||
      current.connectedAt !== session.connectedAt
    )
      throw new Error("Wallet session changed");
    if (current.isRegistered !== true)
      throw new Error("Player registration is required");
  };
  requireRegisteredSession();
  await requireWorkerReadiness(isCurrent);
  requireRegisteredSession();
  const lock = claimSubmission(context, "market-signing:" + itemId);
  if (!lock)
    throw new Error("This purchase is already awaiting Keychain approval");
  const submitted = (transactionId: string | null) => {
    recordSubmittedTransaction(context, {
      kind: "payment",
      label: `Buy ${itemId} · ${price} HIVE`,
      transactionId,
      type: "market_purchase",
    });
    if (isCurrent()) context.onSubmitted?.();
  };
  try {
    const result = await transferNative({
      username: session.address,
      account: getHiveMarketAccount(),
      symbol: "HIVE",
      amount: toHiveQuantity(price),
      action: "market_purchase",
      metadata: { itemId },
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
