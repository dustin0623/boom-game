import { wait } from "../utils/wait";
import type { GameActionStreamWorkerOptions } from "../features/types/stream";
import { randomUUID } from "node:crypto";
import { type CustomJsonEvent, type NormalizedBlock } from "hivexph-sdk";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import { config } from "@/lib/config/config";
import { logger } from "@/lib/logger.server";
import { createGameActionProcessor } from "@/server/game-smart-contract/features/events/process-game-action/action";
import { createGameActionRegistry } from "@/server/game-smart-contract/features/events/process-game-action/dispatch";
import { acquireWorkerLease } from "@/server/game-smart-contract/features/events/worker-lifecycle/lease";
import { recoverPendingGameActions } from "@/server/game-smart-contract/features/events/process-game-action/recovery";
import { recoverDeferredGameActions } from "@/server/game-smart-contract/features/events/process-game-action/recovery";
import { decodeHiveGameActivities } from "@/lib/utils/game/hive-activity";
import { observeHivePayment } from "@/server/game-smart-contract/features/events/payment-processing/intake";

function reportStreamError(error: unknown, blockNumber: number) {
  logger.warn("Blockchain stream RPC error; SDK will retry", {
    blockNumber,
    error: error instanceof Error ? error.message : String(error),
  });
}
export async function resolveStreamStartBlock(
  signal: AbortSignal,
): Promise<number> {
  const initial = (await hiveClient.rpc.getDynamicGlobalProperties({ signal }))
    .last_irreversible_block_num;
  if (!Number.isSafeInteger(initial) || initial < 1)
    throw new Error("Invalid Hive stream start block");
  return initial;
}
export async function* createGameActionStream(
  signal: AbortSignal,
  startBlock: number,
): AsyncGenerator<NormalizedBlock> {
  const hive = hiveClient;
  const initial = startBlock;
  if (!Number.isSafeInteger(initial) || initial < 1)
    throw new Error("Invalid Hive stream start block");
  for await (const block of hive.blocks.watch({
    signal,
    fromBlock: initial,
    pollIntervalMs: config.game.stream.pollMs,
    onError: reportStreamError,
  })) {
    let waitingReported = false;
    while (!signal.aborted) {
      const irreversibleBlock = (
        await hive.rpc.getDynamicGlobalProperties({ signal })
      ).last_irreversible_block_num;
      if (irreversibleBlock >= block.blockNumber) break;
      if (!waitingReported) {
        logger.info("Blockchain stream waiting for irreversible block", {
          blockNumber: block.blockNumber,
          irreversibleBlock,
        });
        waitingReported = true;
      }
      await wait(config.game.stream.pollMs, signal);
    }
    if (signal.aborted) return;
    // Read again after finality, so a reversible fork cannot enter authoritative state.
    const canonical = hive.blocks.watch({
      signal,
      fromBlock: block.blockNumber,
      onError: reportStreamError,
    });
    try {
      const confirmed = await canonical.next();
      if (confirmed.done) throw new Error("Irreversible block unavailable");
      yield confirmed.value;
    } finally {
      await canonical.return();
    }
  }
}
export async function runGameActionStreamWorker({
  stream,
  createStream = createGameActionStream,
  position = {},
  signal = new AbortController().signal,
  onEvent = () => {},
  actionRegistry,
  onPayment = observeHivePayment,
  onStart,
  onStop,
  resolveStartBlock = resolveStreamStartBlock,
}: GameActionStreamWorkerOptions = {}): Promise<void> {
  const owner = `game-contract-${randomUUID()}`;
  const lease = await acquireWorkerLease({
    owner,
    ttlMs: config.game.stream.leaseTtlMs,
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  let lostLease: Error | null = null;
  let recoveryFailure: Error | null = null;
  const checkLease = async () => {
    if (lostLease || !(await lease.check())) {
      lostLease = new Error("Smart-contract worker lease lost");
      controller.abort();
      throw lostLease;
    }
  };
  let renewing = false;
  const heartbeat = setInterval(
    () => {
      if (renewing) return;
      renewing = true;
      void checkLease()
        .catch((error) => {
          lostLease = error;
          controller.abort();
        })
        .finally(() => {
          renewing = false;
        });
    },
    Math.max(100, Math.floor(config.game.stream.leaseTtlMs / 3)),
  );
  const processor = createGameActionProcessor(
    actionRegistry ?? createGameActionRegistry(),
    checkLease,
  );
  let iterator: AsyncIterator<CustomJsonEvent | NormalizedBlock> | undefined;
  const processEvent = async (event: CustomJsonEvent) => {
    await checkLease();
    onEvent(event);
    if (controller.signal.aborted) return;
    const identity = {
      blockNumber: event.blockNumber,
      transactionId: event.transactionId,
      operationIndex: event.operationIndex,
      account: event.account,
    };
    logger.info("Game action received", identity);
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await processor.process(event);
        if (result.status === "rejected" && result.reason.includes("in-flight"))
          throw new Error("Waiting for expired gameplay claim");
        logger.info("Game action processed", {
          ...identity,
          status: result.status,
          ...(result.status === "executed"
            ? { action: result.action }
            : { reason: result.reason }),
        });
        return;
      } catch (error) {
        if (
          attempt >= config.game.stream.maxRetries ||
          controller.signal.aborted
        )
          throw error;
        logger.warn("Game action processing retry", {
          ...identity,
          attempt,
          code: "GAME_ACTION_RETRY",
        });
        await wait(
          config.game.stream.retryBackoffMs * attempt,
          controller.signal,
        );
      }
    }
  };
  try {
    await lease.markStarting();
    const source =
      position.blockNumber === undefined
        ? "latest-irreversible"
        : "in-memory-resume";
    const initial =
      position.blockNumber ?? (await resolveStartBlock(controller.signal));
    if (!Number.isSafeInteger(initial) || initial < 1)
      throw new Error("Invalid Hive stream start block");
    await checkLease();
    if (controller.signal.aborted) return;
    // Capture before queued recovery so retries retain the original boundary.
    position.blockNumber = initial;
    await recoverPendingGameActions(processEvent);
    await checkLease();
    if (controller.signal.aborted) return;
    logger.info("Blockchain stream started", {
      fromBlock: initial,
      source,
      pollMs: config.game.stream.pollMs,
      gameActionsEnabled: config.game.stream.enabled,
      finality: "irreversible",
    });
    await onStart?.(checkLease, async () => {
      try {
        await recoverDeferredGameActions(
          processEvent,
          () => controller.signal.aborted,
        );
      } catch (cause) {
        recoveryFailure = new Error(
          "Saved gameplay recovery could not establish safe progress",
          { cause },
        );
        controller.abort();
        throw recoveryFailure;
      }
    });
    iterator = (stream ?? createStream(controller.signal, initial))[
      Symbol.asyncIterator
    ]();
    while (!controller.signal.aborted) {
      const next = await iterator.next();
      if (next.done) break;
      if ("transactions" in next.value) {
        const block = next.value;
        const activities = decodeHiveGameActivities(
          block,
          config.blockchain.treasuryAccount,
          config.blockchain.token,
          config.blockchain.marketAccount,
        );
        for (const activity of activities) {
          if (controller.signal.aborted) break;
          if (activity.kind === "game") {
            if (config.game.stream.enabled) await processEvent(activity.event);
          } else {
            await checkLease();
            logger.info("Hive payment received", {
              blockNumber: activity.blockNumber,
              transactionId: activity.transactionId,
              operationIndex: activity.operationIndex,
              from: activity.from,
              symbol: activity.symbol,
            });
            await onPayment(activity);
          }
        }
        if (controller.signal.aborted) break;
        await checkLease();
        if (controller.signal.aborted) break;
        // Inclusive replay is protected by operation claims and receipts.
        position.blockNumber = block.blockNumber;
        await lease.markBlockChecked();
        logger.info("Hive block checked", {
          blockNumber: block.blockNumber,
          transactions: block.transactions.length,
          gameActions: activities.filter((activity) => activity.kind === "game")
            .length,
          payments: activities.filter((activity) => activity.kind === "payment")
            .length,
        });
      } else {
        await processEvent(next.value);
        if (controller.signal.aborted) break;
        await checkLease();
        if (controller.signal.aborted) break;
        position.blockNumber = next.value.blockNumber;
        await lease.markBlockChecked();
      }
    }
    if (lostLease) throw lostLease;
    if (recoveryFailure) throw recoveryFailure;
  } catch (error) {
    if (!signal.aborted) {
      logger.error("Game-action stream stopped", {
        code: "GAME_STREAM_STOPPED",
      });
      throw error;
    }
  } finally {
    await lease.markStarting().catch(() => {});
    controller.abort();
    logger.info("Blockchain stream stopped");
    clearInterval(heartbeat);
    signal.removeEventListener("abort", abort);
    try {
      await iterator?.return?.();
    } finally {
      try {
        await onStop?.();
      } finally {
        await lease.release();
      }
    }
  }
}
