import { vi } from "vitest";
import { InboundTransactionModel } from "@/lib/modules/transactions-pending/server.model";
import { ProcessedTransactionModel } from "@/lib/modules/transactions-processed/server.model";
import { EquipmentModel } from "@/lib/modules/equipments/server.model";
import { GameStatModel } from "@/lib/modules/game-stats/server.model";

/** Lose one write acknowledgement after its durable effect in an isolated test database. */
export function failMarketFeeWriteAfter(stage: string) {
  const target =
    stage === "source-receipt" || stage.includes("archive")
      ? ProcessedTransactionModel
      : stage === "item-unlock"
        ? EquipmentModel
        : stage === "counter-cleanup"
          ? GameStatModel
          : InboundTransactionModel;
  const method =
    stage === "source-receipt"
      ? "create"
      : stage === "job-cleanup"
        ? "deleteOne"
        : "updateOne";
  const original = target[method];
  let injected = false;
  vi.spyOn(target, method).mockImplementation((async (...args: unknown[]) => {
    const query = args[0] as Record<string, unknown>;
    const update = args[1] as
      | {
          $set?: Record<string, unknown>;
          $unset?: Record<string, unknown>;
          $pull?: Record<string, unknown>;
        }
      | undefined;
    const feeKey =
      (query.treasuryTransfers as { $elemMatch?: { key?: string } } | undefined)
        ?.$elemMatch?.key === "market-fee:purchase";
    const match =
      stage === "capture"
        ? !!update?.$set?.marketFeeObligation
        : stage === "source-receipt"
          ? query.txHash === "purchase"
          : stage === "source-archive"
            ? update?.$set?.["metadata.marketFeeStatus"] === "pending"
            : stage === "item-unlock"
              ? !!update?.$unset?.purchaseReservation
              : stage === "counter-cleanup"
                ? update?.$pull?.settlementKeys === "purchase"
                : stage === "fee-submission"
                  ? feeKey &&
                    update?.$set?.["treasuryTransfers.$.state"] === "submitted"
                  : stage === "fee-verification"
                    ? feeKey &&
                      !!update?.$set?.["treasuryTransfers.$.verifiedAt"]
                    : stage === "paid-marker"
                      ? update?.$set?.marketFeeStatus === "paid"
                      : stage === "final-archive"
                        ? update?.$set?.["metadata.marketFeeStatus"] === "paid"
                        : true;
    const crash = match && !injected;
    if (crash) injected = true;
    const result = await Reflect.apply(original, target, args);
    if (crash)
      throw Error("lost marketplace fee acknowledgement after " + stage);
    return result;
  }) as never);
  return { injected: () => injected };
}
