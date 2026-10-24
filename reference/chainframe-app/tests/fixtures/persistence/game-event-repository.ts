import type { CustomJsonEvent } from "hivexph-sdk";
import type {
  GameEventRecord,
  GameEventRepository,
} from "./game-event-contract";
import { gameEventKey, toGameEventRecord } from "./game-event-contract";
import { getFixtureState } from "./store";

function update(
  eventKey: string,
  status: GameEventRecord["status"],
  reason?: string,
  token?: string,
): void {
  const record = getFixtureState().gameEvents.get(eventKey);
  if (!record) throw new Error(`unknown game event ${eventKey}`);
  if (token && record.claimToken !== token)
    throw new Error("Stale gameplay claim");
  record.status = status;
  record.reason = reason;
  record.updatedAt = Date.now();
}

export function createFixtureGameEventRepository(): GameEventRepository {
  return {
    async findNonce(actor, nonce, exceptKey) {
      const current = getFixtureState().gameEvents.get(exceptKey);
      return (
        [...getFixtureState().gameEvents.values()].find(
          (record) =>
            record.actor === actor &&
            record.nonce === nonce &&
            record.eventKey !== exceptKey &&
            (!current ||
              record.blockNumber < current.blockNumber ||
              (record.blockNumber === current.blockNumber &&
                (record.transactionIndex < current.transactionIndex ||
                  (record.transactionIndex === current.transactionIndex &&
                    record.operationIndex <= current.operationIndex)))),
        ) ?? null
      );
    },
    async listRecoverable() {
      return [...getFixtureState().gameEvents.values()]
        .filter(
          (record) =>
            record.status === "failed" ||
            (record.status === "queued" &&
              (record.claimUntil ?? 0) <= Date.now()),
        )
        .sort(
          (a, b) =>
            a.blockNumber - b.blockNumber ||
            a.transactionIndex - b.transactionIndex ||
            a.operationIndex - b.operationIndex,
        )
        .flatMap((record) => (record.event ? [record.event] : []));
    },
    async get(eventKey) {
      return getFixtureState().gameEvents.get(eventKey) ?? null;
    },
    async claim(event: CustomJsonEvent, token) {
      const key = gameEventKey(event);
      const existing = getFixtureState().gameEvents.get(key);
      if (existing) {
        if (existing.status === "reconciliation") return "reconciliation";
        if (existing.status === "processed") return "processed";
        if (existing.status === "rejected") return "rejected";
        if (
          existing.status === "failed" ||
          (existing.status === "queued" &&
            (existing.claimUntil ?? 0) <= Date.now())
        ) {
          existing.status = "queued";
          existing.attempts = (existing.attempts ?? 0) + 1;
          existing.claimUntil = Date.now() + 30_000;
          existing.claimToken = token;
          existing.updatedAt = Date.now();
          return "claimed";
        }
        return "in-flight";
      }
      getFixtureState().gameEvents.set(key, {
        ...toGameEventRecord(event, "queued"),
        claimToken: token,
      });
      return "claimed";
    },
    async markProcessed(eventKey, result, token) {
      update(eventKey, "processed", undefined, token);
      getFixtureState().gameEvents.get(eventKey)!.result = result;
    },
    async markRejected(eventKey, reason, token) {
      update(eventKey, "rejected", reason, token);
    },
    async markFailed(eventKey, reason, token) {
      if (
        token &&
        getFixtureState().gameEvents.get(eventKey)?.claimToken !== token
      )
        return;
      update(eventKey, "failed", reason, token);
    },
    async beginEffects() {},
    async clearEffects() {},
    async park(eventKey, reason, token) {
      update(eventKey, "reconciliation", reason, token);
    },
    async acquireLease(owner, ttlMs) {
      const state = getFixtureState();
      const now = Date.now();
      if (
        state.gameStreamLease &&
        state.gameStreamLease.expiresAt > now &&
        state.gameStreamLease.owner !== owner
      )
        return false;
      state.gameStreamLease = { owner, expiresAt: now + ttlMs };
      return true;
    },
    async renewLease(owner, ttlMs) {
      const state = getFixtureState();
      if (
        state.gameStreamLease?.owner !== owner ||
        state.gameStreamLease.expiresAt <= Date.now()
      )
        return false;
      state.gameStreamLease.expiresAt = Date.now() + ttlMs;
      return true;
    },
    async releaseLease(owner) {
      const state = getFixtureState();
      if (state.gameStreamLease?.owner === owner) state.gameStreamLease = null;
    },
    async getDiagnostics() {
      const records = [...getFixtureState().gameEvents.values()];
      return {
        queueDepth: records.filter(
          (record) => record.status === "queued" || record.status === "failed",
        ).length,
        streamLag: null,
        retryCount: records.filter((record) => record.status === "failed")
          .length,
        rejectedEventCount: records.filter(
          (record) => record.status === "rejected",
        ).length,
      };
    },
  };
}
