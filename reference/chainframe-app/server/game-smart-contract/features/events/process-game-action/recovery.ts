import type { CustomJsonEvent } from "hivexph-sdk";
import { listRecoverableGameActions } from "@/lib/modules/transactions-pending/server.repository";
import { readRecoverableGameBatches } from "@/lib/modules/transactions-pending/server.repository";
import {
  gameParticipants,
  gameplayDependencies,
} from "@/features/events/backend/raid/dependencies";
import { logger } from "@/lib/logger.server";
import {
  getPendingGameEvent,
  resumeVerifiedRaid,
} from "@/lib/modules/transactions-pending/server.repository";
import { readActiveRaid } from "@/lib/modules/players/server.repository";
import { validateRaidSettlement } from "@/features/events/backend/raid/action";
import { withDatabaseOperation } from "@/lib/utils/database/operation.server";
import { withGameExecution } from "@/lib/utils/game/execution-context.server";
import {
  normalizeBlockchainTimestamp,
  validateGameActionProtocol,
} from "./validation";
import { isDeepStrictEqual } from "node:util";

/** Private operator inspection. No database mutation, broadcasting or guessed legacy evidence. */
export async function inspectRaidRecovery(key: string) {
  const record = await getPendingGameEvent(key);
  const journal = record?.raidSettlement;
  if (!record?.event || !record.randomSeed || !journal || journal.version !== 1)
    throw new Error("Supported raid evidence is required");
  const payload = validateGameActionProtocol(record.event);
  if (payload.action !== "raid") throw new Error("Not a raid operation");
  await withGameExecution(
    normalizeBlockchainTimestamp(record.event.blockTimestamp),
    record.randomSeed,
    async () => {
      validateRaidSettlement(
        journal,
        record.actor,
        payload.metadata.target,
        `${record.transactionId}:${record.operationIndex}`,
        key,
      );
    },
    key,
  );
  for (const wallet of [journal.attacker, journal.defender]) {
    const marker = await readActiveRaid(wallet);
    const steps = journal.steps.filter((step) => step.wallet === wallet);
    if (
      marker &&
      (marker.key !== key ||
        marker.version !== 1 ||
        marker.steps.length > steps.length ||
        !marker.steps.every((step, index) =>
          isDeepStrictEqual(step, steps[index]),
        ))
    )
      throw new Error("Conflicting raid marker evidence");
  }
  return record;
}

/** Internal operator entrypoint; never an HTTP/CLI or a force-unlock operation. */
export async function resumeRaidRecovery(
  key: string,
  checkLease: () => Promise<void>,
) {
  const [{ createGameActionProcessor }, { createGameActionRegistry }] =
    await Promise.all([import("./action"), import("./dispatch")]);
  const event = await withDatabaseOperation(async () => {
    await checkLease();
    const record = await inspectRaidRecovery(key);
    await resumeVerifiedRaid(key, record.raidSettlement!);
    return record.event!;
  });
  return createGameActionProcessor(
    createGameActionRegistry(),
    checkLease,
  ).process(event);
}

/** Recover saved submissions through the worker's existing guarded/retry processing callback. */
export async function recoverPendingGameActions(
  processEvent: (event: CustomJsonEvent) => Promise<void>,
): Promise<void> {
  // Verify all saved participant evidence before the worker can become ready.
  await gameplayDependencies([]);
  const recoverable = await listRecoverableGameActions();
  if (recoverable.length > 0)
    logger.info("Recovering pending game actions", {
      count: recoverable.length,
    });
  for (const event of recoverable) await processEvent(event);
}

/** Existing worker tick owns scheduling; blocked rows do not consume the runnable budget. */
export async function recoverDeferredGameActions(
  processEvent: (event: CustomJsonEvent) => Promise<void>,
  stopped: () => boolean,
) {
  let attempted = 0;
  for await (const rows of readRecoverableGameBatches())
    for (const job of rows) {
      const event = job.gameEvent?.event;
      if (
        !event ||
        !(
          job.status === "failed" ||
          job.gameEvent?.waitingFor?.length ||
          (job.gameEvent?.claimUntil ?? 0) <= Date.now()
        )
      )
        continue;
      if (stopped() || attempted >= 100) return;
      if (
        (await gameplayDependencies(await gameParticipants(event), event))
          .length
      )
        continue;
      attempted++;
      await processEvent(event);
    }
}
