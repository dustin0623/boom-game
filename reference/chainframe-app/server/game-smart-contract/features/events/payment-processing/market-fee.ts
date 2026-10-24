import { config } from "@/lib/config/config";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";
import {
  toMilliHive,
  toHiveQuantity,
  hiveAmountSchema,
} from "@/lib/utils/game/pricing";
import {
  withDatabaseOperation,
  DatabaseOperationUncertainError,
} from "@/lib/utils/database/operation.server";
import {
  captureMarketFeeObligation,
  finishMarketFeeObligation,
  getPendingTreasuryTransfers,
  findPendingBySignature,
  completeJob,
} from "@/lib/modules/transactions-pending/server.repository";
import {
  getProcessedTransaction,
  archiveMarketFeeSettlement,
} from "@/lib/modules/transactions-processed/server.repository";
import { clearMarketReservation } from "@/lib/modules/equipments/server.repository";
import { clearSettlementStat } from "@/lib/modules/game-stats/server.repository";
import type {
  IInboundTransaction,
  MarketFeeObligation,
  TreasuryTransfer,
} from "@/lib/modules/transactions-pending/server.types";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { dispatchTreasuryTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch";
import { requireConfirmedTransfer } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import {
  SettlementUncertainError,
  TreasuryPendingError,
  TreasuryFailedError,
} from "@/server/game-smart-contract/features/events/treasury/errors.server";
import { loadTreasuryTransfers } from "./support";

function checkRouting(job: IInboundTransaction, current = true) {
  try {
    if (
      job.marketFeePolicyVersion !== 1 ||
      job.financialWorkflowVersion !== 1 ||
      job.paymentCurrency !== "HIVE" ||
      !job.paymentAccount ||
      !job.marketFeeTreasuryAccount ||
      normalizeHiveUsername(job.paymentAccount) !== job.paymentAccount ||
      normalizeHiveUsername(job.marketFeeTreasuryAccount) !==
        job.marketFeeTreasuryAccount ||
      (current &&
        (job.paymentAccount !== config.blockchain.marketAccount ||
          job.marketFeeTreasuryAccount !== config.blockchain.treasuryAccount ||
          hiveClient.resolveAccount("market").account !== job.paymentAccount))
    )
      throw new Error("Invalid routing");
  } catch (cause) {
    throw new SettlementUncertainError(
      "Missing or changed marketplace fee routing",
      { cause },
    );
  }
}

function checkObligation(job: IInboundTransaction, value: MarketFeeObligation) {
  const settlement = job.marketSettlement;
  try {
    if (
      !settlement ||
      settlement.currency !== "HIVE" ||
      value.source !== job.signature ||
      value.source !== job.paymentTxId ||
      !Number.isSafeInteger(value.operationIndex) ||
      value.operationIndex < 0 ||
      value.operationIndex !== job.paymentOperationIndex ||
      value.buyer !== job.walletAddress ||
      value.seller !== settlement.seller ||
      value.itemId !== job.itemId ||
      value.accountAlias !== "market" ||
      value.from !== job.paymentAccount ||
      value.to !== job.marketFeeTreasuryAccount ||
      value.priceMilli !== toMilliHive(job.price!) ||
      value.priceMilli !== toMilliHive(settlement.price) ||
      value.feeMilli !==
        (settlement.fee === 0 ? 0 : toMilliHive(settlement.fee)) ||
      value.proceedsMilli !== toMilliHive(settlement.proceeds) ||
      value.priceMilli !== value.feeMilli + value.proceedsMilli
    )
      throw new Error("Invalid obligation");
  } catch (cause) {
    throw new SettlementUncertainError(
      "Marketplace fee obligation evidence mismatch",
      { cause },
    );
  }
}

/** After exact payment/reservation verification, before any seller broadcast. */
export async function prepareMarketFee(job: IInboundTransaction) {
  checkRouting(job);
  if (job.marketFeeStatus !== undefined && job.marketFeeStatus !== "pending")
    throw new SettlementUncertainError(
      "Marketplace fee has terminal status without source receipt",
    );
  const settlement = job.marketSettlement;
  if (!settlement)
    throw new SettlementUncertainError("Missing marketplace settlement");
  const value: MarketFeeObligation = {
    source: job.signature,
    operationIndex: job.paymentOperationIndex!,
    buyer: job.walletAddress,
    seller: settlement.seller,
    itemId: job.itemId!,
    priceMilli: toMilliHive(settlement.price),
    feeMilli: settlement.fee === 0 ? 0 : toMilliHive(settlement.fee),
    proceedsMilli: toMilliHive(settlement.proceeds),
    accountAlias: "market",
    from: job.paymentAccount!,
    to: job.marketFeeTreasuryAccount!,
  };
  checkObligation(job, value);
  const captured = await captureMarketFeeObligation(job.signature, value);
  if (
    Object.entries(value).some(
      ([key, field]) => captured[key as keyof MarketFeeObligation] !== field,
    )
  )
    throw new SettlementUncertainError("Marketplace fee obligation changed");
  job.marketFeeObligation = captured;
  job.marketFeeStatus ??= "pending";
}

function confirmedTransfer(transfer: TreasuryTransfer | undefined) {
  return (
    transfer?.state === "confirmed" &&
    !!transfer.transactionId &&
    !!transfer.verifiedAt &&
    Number.isInteger(transfer.operationIndex) &&
    transfer.operationIndex! >= 0 &&
    Number.isInteger(transfer.blockNumber) &&
    transfer.blockNumber! > 0
  );
}

/** Only keyed follow-up work is allowed after the durable buyer receipt. */
export async function settleMarketFee(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  try {
    checkRouting(job, false);
    const value = job.marketFeeObligation;
    const receipt = await getProcessedTransaction(job.signature);
    if (
      !value ||
      !receipt ||
      receipt.status !== "success" ||
      receipt.type !== "market_purchase" ||
      receipt.wallet !== job.walletAddress ||
      receipt.amount !== -job.price! ||
      job.databaseEffectsStarted ||
      receipt.metadata?.type !== "market_purchase" ||
      receipt.metadata.marketFeePolicyVersion !== 1 ||
      !["pending", "paid", "not_due"].includes(
        receipt.metadata.marketFeeStatus ?? "",
      ) ||
      receipt.metadata.currency !== "HIVE" ||
      receipt.metadata.itemId !== value.itemId ||
      receipt.metadata.seller !== value.seller ||
      receipt.metadata.paymentOperationIndex !== value.operationIndex ||
      !hiveAmountSchema.safeParse(receipt.metadata.price).success ||
      (receipt.metadata.fee !== 0 &&
        !hiveAmountSchema.safeParse(receipt.metadata.fee).success) ||
      toMilliHive(receipt.metadata.price) !== value.priceMilli ||
      (receipt.metadata.fee === 0 ? 0 : toMilliHive(receipt.metadata.fee)) !==
        value.feeMilli ||
      !receipt.metadata.marketFeeObligation ||
      Object.entries(value).some(
        ([key, field]) =>
          receipt.metadata!.marketFeeObligation![
            key as keyof MarketFeeObligation
          ] !== field,
      )
    )
      throw new SettlementUncertainError(
        "Exact marketplace source completion evidence is required",
      );
    checkObligation(job, value);
    const pending = await findPendingBySignature(job.signature);
    const transfers = pending
      ? await getPendingTreasuryTransfers(job.signature)
      : (receipt.metadata.treasuryTransfers ?? []);
    const seller = transfers.find(
      (transfer) => transfer.key === `market-sale:${job.signature}`,
    );
    const matchesSeller = (transfer: TreasuryTransfer | undefined) =>
      confirmedTransfer(transfer) &&
      transfer!.intent.from === value.from &&
      transfer!.intent.to === value.seller &&
      transfer!.intent.accountAlias === "market" &&
      transfer!.intent.symbol === "HIVE" &&
      transfer!.intent.quantity ===
        toHiveQuantity(value.proceedsMilli / 1000) &&
      transfer!.intent.memo === `Chainframe marketplace sale ${value.source}` &&
      transfer!.intent.operation === undefined;
    const archivedSeller = receipt.metadata.treasuryTransfers?.find(
      (transfer) => transfer.key === `market-sale:${job.signature}`,
    );
    if (
      !matchesSeller(seller) ||
      (archivedSeller &&
        (!matchesSeller(archivedSeller) ||
          archivedSeller.transactionId !== seller!.transactionId ||
          archivedSeller.blockNumber !== seller!.blockNumber ||
          archivedSeller.operationIndex !== seller!.operationIndex))
    )
      throw new SettlementUncertainError(
        "Verified marketplace seller payout is required",
      );
    const due = value.feeMilli > 0 && value.from !== value.to;
    if (!pending) {
      if (receipt.metadata.marketFeeStatus === "not_due" && !due) return;
      const fee = transfers.find(
        (transfer) => transfer.key === `market-fee:${job.signature}`,
      );
      if (
        receipt.metadata.marketFeeStatus === "paid" &&
        due &&
        confirmedTransfer(fee) &&
        fee!.intent.accountAlias === "market" &&
        fee!.intent.from === value.from &&
        fee!.intent.to === value.to &&
        fee!.intent.symbol === "HIVE" &&
        fee!.intent.quantity === toHiveQuantity(value.feeMilli / 1000) &&
        fee!.intent.memo === `Chainframe marketplace fee ${value.source}` &&
        fee!.intent.operation === undefined
      )
        return;
      throw new SettlementUncertainError(
        "Missing parent for unfinished marketplace fee",
      );
    }
    if (
      pending.marketFeeStatus !== "pending" &&
      pending.marketFeeStatus !== "paid" &&
      pending.marketFeeStatus !== "not_due"
    )
      throw new SettlementUncertainError("Unsupported marketplace fee status");
    if (
      (pending.marketFeeStatus === "paid" && !due) ||
      (pending.marketFeeStatus === "not_due" && due)
    )
      throw new SettlementUncertainError(
        "Marketplace fee status and obligation differ",
      );
    // Archive seller proof before releasing the item. Fee retries never revisit ownership.
    await withDatabaseOperation(async () => {
      await context.checkLease();
      if (!archivedSeller)
        await archiveMarketFeeSettlement(job.signature, value, "pending", [
          seller!,
        ]);
      await clearMarketReservation(value.itemId, job.signature);
      await clearSettlementStat("totalMarketSales", job.signature);
    });
    let status: "paid" | "not_due";
    checkRouting(job);
    if (due) {
      const payout = await dispatchTreasuryTransfer(
        context,
        job.signature,
        `market-fee:${job.signature}`,
        value.to,
        toHiveQuantity(value.feeMilli / 1000),
        "HIVE",
        `Chainframe marketplace fee ${value.source}`,
        "market",
        value.from,
      );
      if (payout.status === "pending") return;
      requireConfirmedTransfer(payout);
      status = "paid";
    } else status = "not_due";
    await withDatabaseOperation(async () => {
      await context.checkLease();
      await finishMarketFeeObligation(job.signature, status);
      const finalTransfers = await loadTreasuryTransfers(job.signature);
      if (finalTransfers.some((transfer) => transfer.state !== "confirmed"))
        throw new SettlementUncertainError(
          "Unpaid marketplace fee evidence requires review",
        );
      await archiveMarketFeeSettlement(
        job.signature,
        value,
        status,
        finalTransfers,
      );
      await completeJob(String(job._id));
    });
  } catch (error) {
    if (error instanceof DatabaseOperationUncertainError) {
      if (error.cause instanceof SettlementUncertainError) throw error.cause;
      throw new Error(
        "Keyed marketplace fee finalization incomplete; retry required",
        { cause: error },
      );
    }
    if (
      error instanceof SettlementUncertainError ||
      error instanceof TreasuryPendingError ||
      error instanceof TreasuryFailedError
    )
      throw error;
    throw new Error("Marketplace fee follow-up incomplete; retry required", {
      cause: error,
    });
  }
}
