import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { randomUUID } from "node:crypto";
import { withGameExecution } from "@/lib/utils/game/execution-context.server";

import { config } from "@/lib/config/config";
import { REGISTRATION_FEE_HIVE } from "@/lib/config/constants/game";
import { getShopHiveAmount, hiveAmountSchema } from "@/lib/utils/game/pricing";
import { isTransactionProcessed } from "@/lib/modules/transactions-processed/server.repository";
import {
  enqueueDeposit,
  enqueueRegistration,
  enqueueShopPurchase,
  enqueueMarketPurchase,
  enqueuePaymentReconciliation,
} from "@/lib/modules/transactions-pending/server.repository";
import type { ObservedPayment } from "@/lib/utils/game/hive-activity";

/** Invoked by irreversible blockchain intake; never accepts a browser's payment claim. */
export async function observeHivePayment(
  payment: ObservedPayment,
): Promise<void> {
  if (!payment.transactionId)
    throw new Error("Missing payment transaction identity");
  const isMarket = payment.trigger.action === "market_purchase";
  const recipient = isMarket
    ? config.blockchain.marketAccount
    : config.blockchain.treasuryAccount;
  if (!recipient || payment.to !== recipient)
    throw new Error("Wrong payment recipient");
  if (
    payment.symbol !==
    (payment.trigger.action === "deposit" ? config.blockchain.token : "HIVE")
  )
    throw new Error("Wrong payment currency");
  const txId = payment.transactionId;
  if (payment.paymentsInTransaction > 1) {
    await enqueuePaymentReconciliation({
      transactionId: txId,
      walletAddress: payment.from,
      paymentOperationIndex: payment.operationIndex,
      reason:
        "Multiple game payments in one transaction require indexed reconciliation",
    });
    return;
  }
  if (await isTransactionProcessed(txId)) return;
  const amount = Number(payment.quantity);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const timestamp = Date.parse(
    payment.blockTimestamp.endsWith("Z")
      ? payment.blockTimestamp
      : `${payment.blockTimestamp}Z`,
  );
  if (!Number.isFinite(timestamp))
    throw new Error("Invalid payment block timestamp");
  await withGameExecution(timestamp, randomUUID(), async () => {
    const trigger = payment.trigger;
    if (trigger.action === "registration" && payment.symbol === "HIVE") {
      await playerRepository.findOrCreate(payment.from);
      await enqueueRegistration({
        walletAddress: payment.from,
        paymentOperationIndex: payment.operationIndex,
        depositTxId: txId,
        registrationHiveAmount: REGISTRATION_FEE_HIVE,
      });
    } else if (
      trigger.action === "shop_purchase" &&
      payment.symbol === "HIVE"
    ) {
      const { kind, itemId, quantity } = trigger.metadata;
      const price = getShopHiveAmount(kind, itemId, quantity);
      if (price === null) return;
      await enqueueShopPurchase({
        walletAddress: payment.from,
        paymentOperationIndex: payment.operationIndex,
        paymentTxId: txId,
        shopKind: kind,
        shopItemId: itemId,
        shopQuantity: quantity,
        shopHiveAmount: price,
      });
    } else if (
      trigger.action === "deposit" &&
      payment.symbol === config.blockchain.token
    ) {
      await playerRepository.findOrCreate(payment.from);
      await enqueueDeposit({
        walletAddress: payment.from,
        paymentOperationIndex: payment.operationIndex,
        depositTxId: txId,
        depositAmount: amount,
      });
    } else if (
      trigger.action === "market_purchase" &&
      payment.symbol === "HIVE"
    ) {
      if (!hiveAmountSchema.safeParse(amount).success)
        throw new Error("Invalid HIVE market amount");
      const item = await equipmentRepository.findById(trigger.metadata.itemId);
      await enqueueMarketPurchase({
        feeTreasuryAccount: config.blockchain.treasuryAccount,
        walletAddress: payment.from,
        paymentOperationIndex: payment.operationIndex,
        paymentTxId: txId,
        itemId: trigger.metadata.itemId,
        itemType: item?.slot ?? "item",
        price: amount,
        paymentCurrency: "HIVE",
        paymentAccount: payment.to,
      });
    }
  });
}
