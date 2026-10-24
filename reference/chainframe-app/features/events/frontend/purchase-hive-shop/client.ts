"use client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { getHiveTreasuryAccount } from "@/lib/utils/hive/wallet";
import { transferNative } from "@/lib/chains/modules/hive/wallet/events/transfer-native/action";
import {
  waitForTransaction,
  claimSubmission,
  releaseSubmission,
  recordSubmittedTransaction,
} from "@/features/events/frontend/confirm-transaction/client";
import { PaymentBroadcastUncertain } from "@/lib/utils/hive/payment";
import { hiveAmountSchema, toHiveQuantity } from "@/lib/utils/game/pricing";
import { formatShopPrice } from "@/lib/format";
import { describeShopItems } from "@/features/types/game/inventory";
import type {
  PaymentSessionContext,
  PaymentPhase,
  HiveShopOrder,
  HiveShopOutcome,
} from "@/features/types/game/payments";
export async function purchaseHiveShop(
  order: HiveShopOrder,
  context: PaymentSessionContext & { onPhase: (phase: PaymentPhase) => void },
): Promise<HiveShopOutcome> {
  const { session, isCurrent, onPhase } = context;
  if (!session.address || session.mode !== "wallet" || !isCurrent())
    return { ok: false, error: "Connect your wallet first" };
  const lock = claimSubmission(context, "hive-shop");
  if (!lock)
    return { ok: false, error: "A purchase is already awaiting confirmation" };
  let submitted = false;
  const record = (transactionId: string | null) => {
    submitted = true;
    recordSubmittedTransaction(
      context,
      {
        kind: "payment",
        label: `Buy ${describeShopItems(order.itemId, order.quantity)} · ${formatShopPrice(order.hiveAmount)} HIVE`,
        transactionId,
        type: "shop_purchase",
      },
      lock,
    );
    if (isCurrent()) context.onSubmitted?.();
  };
  try {
    onPhase("awaiting-keychain-approval");
    if (!hiveAmountSchema.safeParse(order.hiveAmount).success)
      throw new Error("Invalid amount");
    await requireWorkerReadiness(isCurrent);
    const { transactionId } = await transferNative({
      username: session.address!,
      account: getHiveTreasuryAccount(),
      amount: toHiveQuantity(order.hiveAmount),
      symbol: "HIVE",
      action: "shop_purchase",
      metadata: {
        kind: order.kind,
        itemId: order.itemId,
        quantity: order.quantity,
      },
    });
    record(transactionId);
    if (!isCurrent())
      return {
        ok: false,
        error: "Wallet session changed; payment may still settle",
      };
    onPhase("confirming-onchain");
    await waitForTransaction(transactionId, session, {
      type: "shop_purchase",
    });
    if (!isCurrent())
      return {
        ok: false,
        error: "Wallet session changed; payment may still settle",
      };
    return { ok: true };
  } catch (error) {
    if (error instanceof PaymentBroadcastUncertain) record(null);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "HIVE payment failed",
    };
  } finally {
    if (!submitted) releaseSubmission(lock);
  }
}
