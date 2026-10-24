import { randomUUID } from "node:crypto";
import type { CustomJsonEvent } from "hivexph-sdk";
import type {
  GameEventRecord,
  GameEventStatus,
} from "@/lib/modules/transactions-pending/server.types";
export function gameEventKey(
  event: Pick<CustomJsonEvent, "transactionId" | "operationIndex">,
): string {
  if (
    !event.transactionId ||
    !Number.isSafeInteger(event.operationIndex) ||
    event.operationIndex < 0
  )
    throw new Error("Missing Hive operation identity");
  return `${event.transactionId}:${event.operationIndex}`;
}

export function toGameEventRecord(
  event: CustomJsonEvent,
  status: GameEventStatus,
): GameEventRecord {
  return {
    randomSeed: randomUUID(),
    event,
    nonce:
      typeof event.metadata?.nonce === "string"
        ? event.metadata.nonce.trim()
        : undefined,
    attempts: 1,
    claimUntil: Date.now() + 30_000,
    eventKey: gameEventKey(event),
    transactionId: event.transactionId ?? "",
    operationIndex: event.operationIndex,
    blockNumber: event.blockNumber,
    transactionIndex: event.transactionIndex,
    eventId: event.eventId ?? `${event.transactionId}:${event.operationIndex}`,
    actor: event.account ?? "",
    status,
    updatedAt: Date.now(),
  };
}
