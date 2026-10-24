import { logRepository } from "@/lib/modules/logs/server.repository";
import {
  getPendingGameEvent,
  setGameDependencies,
  setRaidStage,
  parkGameAction,
} from "@/lib/modules/transactions-pending/server.repository";
import { getProcessedGameEvent } from "@/lib/modules/transactions-processed/server.repository";
import {
  gameParticipants,
  gameplayDependencies,
} from "@/features/events/backend/raid/dependencies";
import { logger } from "@/lib/logger.server";
import {
  RaidEvidenceConflict,
  RAID_STAGES,
} from "@/features/types/game/raid-settlement";
import { isDeepStrictEqual } from "node:util";
import { gameActionPersistence } from "@/server/game-smart-contract/features/events/process-game-action/persistence";
import {
  withDatabaseOperation,
  DatabaseOperationUncertainError,
} from "@/lib/utils/database/operation.server";

import type { CustomJsonEvent } from "hivexph-sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { gameEventKey } from "@/lib/utils/game/event-identity.server";
import type {
  GameActionRegistry,
  GameActionProcessingResult,
} from "@/server/game-smart-contract/features/types/processing";
import {
  normalizeBlockchainTimestamp,
  validateGameActionProtocol,
  GameActionRejectedError,
} from "@/server/game-smart-contract/features/events/process-game-action/validation";
import {
  withGameExecution,
  gameActionHasLog,
} from "@/lib/utils/game/execution-context.server";

function reject(reason: string): never {
  throw new GameActionRejectedError(reason);
}

export function createGameActionProcessor(
  registry: GameActionRegistry,
  beforeCommit: () => Promise<void> = async () => {},
) {
  let tail = Promise.resolve();

  const process = (
    event: CustomJsonEvent,
  ): Promise<GameActionProcessingResult> => {
    const operation = tail.then(async () => {
      const eventKey = gameEventKey(event);
      // Durable claims and write markers prevent replay after interrupted direct writes.
      const token = randomUUID();
      const claim = await gameActionPersistence.claim(event, token);
      if (claim === "reconciliation" && event.action === "raid") {
        await gameParticipants(event);
        const saved = await getPendingGameEvent(eventKey);
        if (
          !saved?.event ||
          saved.eventKey !== eventKey ||
          saved.status !== "reconciliation" ||
          !saved.randomSeed ||
          !isDeepStrictEqual(saved.event, event)
        )
          throw new Error("Cannot verify quarantined raid evidence");
        return {
          status: "quarantined",
          eventId: event.eventId,
          reason: "Raid settlement requires review",
        } as const;
      }
      if (claim === "reconciliation")
        throw new Error(
          "Game action requires operator review before checkpoint advancement",
        );
      if (claim !== "claimed")
        return {
          status: "rejected",
          eventId: event.eventId,
          reason:
            claim === "processed"
              ? "duplicate game action"
              : `game action already ${claim}`,
        } as const;
      let recoverableWithdrawal = false;
      try {
        const claimedRecord = await gameActionPersistence.get(eventKey);
        if ((claimedRecord?.attempts ?? 0) > 8 && event.action === "raid") {
          await parkGameAction(
            eventKey,
            "Raid recovery attempts exhausted",
            token,
          );
          logger.warn("Raid recovery exhausted", {
            transactionId: event.transactionId,
            operationIndex: event.operationIndex,
            code: "RAID_RECOVERY_EXHAUSTED",
          });
          return {
            status: "quarantined",
            eventId: event.eventId,
            reason: "Raid recovery attempts exhausted",
          } as const;
        }
        if ((claimedRecord?.attempts ?? 0) > 8)
          reject("game action retry limit reached; operator review required");
        const payload = validateGameActionProtocol(event);
        const previous = await gameActionPersistence.findNonce(
          event.account!,
          payload.metadata.nonce,
          eventKey,
        );
        if (previous) reject("nonce already used by this account");
        // Timestamp validation stays after replay checking to preserve rejection precedence.
        const time = normalizeBlockchainTimestamp(event.blockTimestamp);
        const handler = registry[payload.action];
        if (!handler) reject(`no handler registered for ${payload.action}`);

        const record = await gameActionPersistence.get(eventKey);
        const terminal = record?.raidSettlement
          ? await getProcessedGameEvent(eventKey)
          : null;
        if (terminal) {
          await beforeCommit();
          await gameActionPersistence.markProcessed(
            eventKey,
            terminal.result,
            token,
          );
          return {
            status: "executed",
            eventId: event.eventId,
            action: payload.action,
          } as const;
        }
        if (payload.action === "request_withdrawal") {
          const outcome = await withDatabaseOperation(async () => {
            try {
              const participants = await gameParticipants(event);
              const waitingFor = await withDatabaseOperation(async () => {
                const keys = await gameplayDependencies(participants, event);
                await setGameDependencies(eventKey, participants, keys, token);
                return keys;
              });
              if (waitingFor.length)
                return {
                  status: "deferred",
                  eventId: event.eventId,
                  reason: "Waiting for earlier gameplay",
                } as const;
              recoverableWithdrawal = true;
              await beforeCommit();
              await withGameExecution(
                time,
                record?.randomSeed ?? eventKey,
                async () => {
                  const result = await handler(payload, event);
                  await logRepository.create({
                    type: "game_action",
                    wallet: event.account!,
                    settlementKey: `withdrawal-request:${eventKey}`,
                    data: { action: payload.action },
                  });
                  await beforeCommit();
                  await gameActionPersistence.markProcessed(
                    eventKey,
                    result,
                    token,
                  );
                },
                eventKey,
                beforeCommit,
              );
              return {
                status: "executed",
                eventId: event.eventId,
                action: payload.action,
              } as const;
            } catch (error) {
              return { error } as const;
            }
          });
          if ("error" in outcome) throw outcome.error;
          return outcome;
        }
        let deferred = false;
        await withDatabaseOperation(
          async () => {
            const participants = await gameParticipants(event);
            const waitingFor = await gameplayDependencies(participants, event);
            await setGameDependencies(
              eventKey,
              participants,
              waitingFor,
              token,
            );
            if (waitingFor.length) {
              deferred = true;
              return;
            }
            return withGameExecution(
              time,
              record?.randomSeed ?? eventKey,
              async () => {
                const result = await handler(payload, event);
                if (!gameActionHasLog())
                  await logRepository.create({
                    type: "game_action",
                    wallet: event.account!,
                    data: { action: payload.action },
                  });
                await beforeCommit();
                if (payload.action === "raid")
                  await setRaidStage(eventKey, "receipt");
                await gameActionPersistence.markProcessed(
                  eventKey,
                  result,
                  token,
                );
              },
              eventKey,
              beforeCommit,
            );
          },
          {
            beforeWrite: async () => {
              await beforeCommit();
              await gameActionPersistence.beginEffects(eventKey, token);
            },
            afterSuccess: () =>
              deferred
                ? Promise.resolve()
                : gameActionPersistence.clearEffects(eventKey),
          },
        );
        if (deferred)
          return {
            status: "deferred",
            eventId: event.eventId,
            reason: "Waiting for earlier gameplay",
          } as const;
        return {
          status: "executed",
          eventId: event.eventId,
          action: payload.action,
        } as const;
      } catch (error) {
        let cause: unknown = error;
        for (
          let depth = 0;
          depth < 8 &&
          cause instanceof Error &&
          !(cause instanceof RaidEvidenceConflict);
          depth++
        )
          cause = cause.cause;
        const conflict = cause instanceof RaidEvidenceConflict;
        const raidRecord =
          event.action === "raid" ? await getPendingGameEvent(eventKey) : null;
        if (
          event.action === "raid" &&
          (error instanceof DatabaseOperationUncertainError ||
            conflict ||
            raidRecord?.raidSettlement?.version === 1)
        ) {
          const saved = raidRecord;
          if (!saved?.event || !saved.randomSeed) throw error;
          const stage =
            saved.stage && RAID_STAGES.includes(saved.stage)
              ? saved.stage
              : "preparation";
          await setRaidStage(eventKey, stage, true);
          if (!saved.firstFailure)
            logger.warn("Raid settlement interrupted", {
              transactionId: event.transactionId,
              operationIndex: event.operationIndex,
              stage,
              code: conflict
                ? "RAID_EVIDENCE_CONFLICT"
                : "RAID_WRITE_UNCERTAIN",
            });
          if (saved.raidSettlement?.version === 1 && !conflict) {
            await gameActionPersistence.markFailed(
              eventKey,
              "Raid recovery pending",
              token,
            );
            return {
              status: "deferred",
              eventId: event.eventId,
              reason: "Raid recovery pending",
            } as const;
          }
          await gameActionPersistence.park(
            eventKey,
            "Interrupted raid requires review",
            token,
          );
          const parked = await getPendingGameEvent(eventKey);
          if (parked?.status !== "reconciliation") throw error;
          logger.warn("Raid quarantined", {
            transactionId: event.transactionId,
            operationIndex: event.operationIndex,
            stage,
            code: "RAID_WRITE_UNCERTAIN",
          });
          return {
            status: "quarantined",
            eventId: event.eventId,
            reason: "Raid settlement requires review",
          } as const;
        }
        if (
          error instanceof DatabaseOperationUncertainError &&
          !recoverableWithdrawal
        ) {
          await gameActionPersistence.park(eventKey, error.message, token);
          throw error;
        }
        if (
          error instanceof GameActionRejectedError ||
          error instanceof z.ZodError
        ) {
          const reason =
            error instanceof GameActionRejectedError
              ? error.reason
              : "invalid game-action payload";
          await beforeCommit();
          await withDatabaseOperation(
            () => gameActionPersistence.markRejected(eventKey, reason, token),
            {
              beforeWrite: () =>
                gameActionPersistence.beginEffects(eventKey, token),
              afterSuccess: () => gameActionPersistence.clearEffects(eventKey),
            },
          );
          return {
            status: "rejected",
            eventId: event.eventId,
            reason,
          } as const;
        }
        await gameActionPersistence.markFailed(
          eventKey,
          "Temporary processing failure; retry scheduled",
          token,
        );
        throw error;
      }
    });

    tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  return { process };
}
