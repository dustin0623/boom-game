// template/lib/database/mock/log-repository.ts
import {
  publicLog,
  participants,
  logPage,
  logCursor,
} from "@/lib/utils/logs/history";
import {
  gameActionNow,
  gameActionCorrelationKey,
  markGameActionLog,
} from "@/lib/utils/game/execution-context.server";
import type { LogRecord, LogRepository } from "./types";
import { getFixtureState } from "./store";

export function createFixtureLogRepository(): LogRepository {
  return {
    async listMarketHistory(wallet, limit) {
      return getFixtureState()
        .logs.filter(
          (log) =>
            (log.type === "market" || log.type === "market_item") &&
            log.data?.currency === "HIVE" &&
            (log.participants ?? participants(log)).includes(wallet),
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(publicLog);
    },
    async listMarketSales(limit) {
      return getFixtureState()
        .logs.filter(
          (log) =>
            (log.type === "market" || log.type === "market_item") &&
            log.data?.currency === "HIVE" &&
            (log.data?.action === "bought" || log.data?.action === "sold"),
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(publicLog);
    },
    async listHistory(wallet, options) {
      const direction = options.direction === "newer" ? 1 : -1;
      const compare = (
        a: { time: number; id: string },
        b: { time: number; id: string },
      ) => a.time - b.time || a.id.localeCompare(b.id);
      const matchesCategory = (log: LogRecord) => {
        switch (options.category) {
          case "claims":
            return log.type === "claim";
          case "raids":
            return log.type === "raid";
          case "equipment-minted":
            return log.type === "chest";
          case "salvage":
            return log.type === "salvage";
          case "stat-upgrades":
            return log.type === "stat_upgrade";
          case "equipment-upgrades":
            return log.type === "upgrade";
          case "social":
            return log.type === "help" || log.type === "sabotage";
          case "deposits-withdrawals":
            return (
              log.type === "deposit" ||
              (log.type === "withdrawal" && log.data?.refunded !== true)
            );
          case "staking-registration":
            return (
              log.type === "registration" ||
              (log.type === "vault" && log.data?.event === "stake")
            );
          default:
            return true;
        }
      };
      const rows = getFixtureState()
        .logs.filter(
          (log) =>
            (log.participants ?? participants(log)).includes(wallet) &&
            (!(log.type === "market" || log.type === "market_item") ||
              log.data?.currency === "HIVE") &&
            matchesCategory(log) &&
            (!options.cursor ||
              direction * compare(logCursor(log), options.cursor) > 0),
        )
        .sort((a, b) => direction * compare(logCursor(a), logCursor(b)));
      return logPage(rows, options);
    },
    async countSocialActionsSince(wallet, since) {
      return getFixtureState().logs.filter(
        (log) =>
          log.wallet === wallet &&
          (log.type === "help" || log.type === "sabotage") &&
          log.createdAt >= since,
      ).length;
    },
    async create(input) {
      const state = getFixtureState();
      const log: LogRecord = {
        ...input,
        id: String(state.nextLogId++).padStart(24, "0"),
        participants: input.participants ?? participants(input),
        correlationKey:
          input.correlationKey ?? gameActionCorrelationKey() ?? input.txHash,
        recordedAt: Date.now(),
        createdAt: gameActionNow(),
      };
      state.logs.push(log);
      markGameActionLog();
      return log;
    },
  };
}
