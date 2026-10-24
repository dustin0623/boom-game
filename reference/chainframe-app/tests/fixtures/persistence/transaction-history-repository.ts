import { createHash } from "node:crypto";
import { getFixtureState } from "./store";
import { encodeCursor } from "@/lib/utils/logs/history";
import type { TransactionHistoryRepository } from "./transaction-history-contract";
export function createFixtureTransactionHistoryRepository(): TransactionHistoryRepository {
  return {
    async list(wallet, options) {
      const records = [...getFixtureState().gameEvents.values()].filter(
        (event) => event.actor === wallet,
      );
      const direction = options.direction === "newer" ? 1 : -1;
      const compare = (
        a: { time: number; id: string },
        b: { time: number; id: string },
      ) => a.time - b.time || a.id.localeCompare(b.id);
      const rows = records
        .filter(
          (event) =>
            event.status === "processed" || event.status === "rejected",
        )
        .map((event) => ({
          id: createHash("sha256")
            .update(event.eventKey)
            .digest("hex")
            .slice(0, 24),
          type: "game_action" as const,
          txHash: event.eventKey,
          transactionId: event.transactionId,
          operationIndex: event.operationIndex,
          amount: 0,
          status:
            event.status === "processed"
              ? ("success" as const)
              : ("failed" as const),
          error: event.reason ?? null,
          processedAt: event.updatedAt,
          metadata: {
            type: "game_action",
            action: event.event?.action,
            transactionId: event.transactionId,
            operationIndex: event.operationIndex,
            status: event.status,
          },
        }))
        .filter(
          (tx) =>
            !options.cursor ||
            direction *
              compare({ time: tx.processedAt, id: tx.id }, options.cursor) >
              0,
        )
        .sort(
          (a, b) =>
            direction *
            compare(
              { time: a.processedAt, id: a.id },
              { time: b.processedAt, id: b.id },
            ),
        );
      const history = rows.slice(0, options.limit);
      const last = history.at(-1);
      const newest = direction === 1 ? last : history[0];
      const cursor = (tx: typeof last) =>
        tx ? encodeCursor({ time: tx.processedAt, id: tx.id }) : null;
      return {
        pending: records
          .filter(
            (event) => event.status === "queued" || event.status === "failed",
          )
          .slice(0, options.limit)
          .map((event) => ({
            id: event.eventKey,
            type: "game_action",
            status: event.status === "failed" ? "failed" : "pending",
            signature: event.eventKey,
            transactionId: event.transactionId,
            operationIndex: event.operationIndex,
            amount: 0,
            itemId: null,
            retryCount: event.attempts ?? 0,
            error: event.reason ?? null,
            refunded: false,
            createdAt: event.updatedAt,
          })),
        history,
        nextCursor: rows.length > options.limit ? cursor(last) : null,
        latestCursor: cursor(newest),
      };
    },
  };
}
