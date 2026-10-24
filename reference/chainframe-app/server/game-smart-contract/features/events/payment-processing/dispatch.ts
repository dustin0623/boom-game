import {
  failJob,
  parkJob,
} from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import { logger } from "@/lib/logger.server";
import { holdPaymentFulfillment } from "@/features/events/backend/raid/dependencies";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { processDeposit } from "@/server/game-smart-contract/features/events/payment-processing/settle-deposit";
import { processRegistration } from "@/server/game-smart-contract/features/events/payment-processing/settle-registration";
import { processWithdrawal } from "@/server/game-smart-contract/features/events/payment-processing/settle-withdrawal";
import { processMarketPurchase } from "@/server/game-smart-contract/features/events/payment-processing/settle-market";
import { processShopPurchase } from "@/server/game-smart-contract/features/events/payment-processing/settle-shop";

export async function processJob(
  context: SettlementContext,
  job: IInboundTransaction,
): Promise<void> {
  if (job.databaseEffectsStarted && job.financialWorkflowVersion !== 1) {
    await parkJob(
      String(job._id),
      "Interrupted database writes require operator review",
    );
    return;
  }
  if (await holdPaymentFulfillment(job, true)) return;
  switch (job.type) {
    case "deposit":
      return processDeposit(context, job);
    case "withdrawal":
      return processWithdrawal(context, job);
    case "market_purchase":
      return processMarketPurchase(context, job);
    case "registration":
      return processRegistration(context, job);
    case "shop_purchase":
      return processShopPurchase(context, job);
    default:
      logger.warn("unknown job type", {
        type: (job as { type: string }).type,
      });
      await failJob(String(job._id), "unknown job type", 1);
  }
}
