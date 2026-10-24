import { listPendingOldestFirst } from "@/lib/modules/transactions-pending/server.repository";
import { createErrorLog } from "@/lib/modules/logs/server.repository";
import { logger } from "@/lib/logger.server";
import { withGameExecution } from "@/lib/utils/game/execution-context.server";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { processJob } from "@/server/game-smart-contract/features/events/payment-processing/dispatch";
import { message } from "@/server/game-smart-contract/features/events/payment-processing/support";

export async function drainPaymentJobs(
  context: SettlementContext,
  isStopped: () => boolean,
): Promise<void> {
  try {
    const jobs = await listPendingOldestFirst();
    if (jobs.length === 0) return;

    logger.info(`draining ${jobs.length} job(s)`);
    for (const job of jobs) {
      if (isStopped()) break;
      await context.checkLease();
      await withGameExecution(
        job.eventTime ?? job.createdAt.getTime(),
        job.randomSeed ?? job.signature,
        () => processJob(context, job),
        job.signature,
      );
    }
  } catch (err) {
    logger.error("drain cycle error", { error: message(err) });
    await createErrorLog({
      type: "error",
      error: message(err),
      data: { source: "worker" },
    });
  }
}
