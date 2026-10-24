import { GAME_STATS_METRICS, GAME_STATS_DEFINITIONS } from "@/lib/api/types";
import type {
  GameStatsMetric,
  GameStatsDailyDto,
  GameStatsSummaryDto,
} from "@/lib/api/types";
import type { AnalyticsLogRecord } from "@/lib/modules/logs/server.types";
import type { AnalyticsReceipt } from "@/lib/modules/transactions-processed/server.types";
import { hiveAmountSchema } from "@/lib/utils/game/pricing";

const DAY = 86_400_000;
const dayNumber = (time: number) => Math.floor(time / DAY);
const blankTotals = () =>
  Object.fromEntries(
    GAME_STATS_METRICS.map((metric) => [
      metric,
      GAME_STATS_DEFINITIONS[metric].series.map(() => 0),
    ]),
  ) as Record<GameStatsMetric, number[]>;
export interface GameStatsAggregate {
  asOf: number;
  totals: Record<GameStatsMetric, number[]>;
  daily: { day: string; totals: Record<GameStatsMetric, number[]> }[];
}

/** Only financial log types may use their explicitly stored transfer ID. */
export function analyticsReceiptKey(
  log: AnalyticsLogRecord,
): string | undefined {
  return (
    log.correlationKey ||
    (["registration", "deposit", "market", "withdrawal"].includes(log.type)
      ? log.txHash
      : undefined)
  );
}

/** Pure, completion-gated aggregation; internal identities never leave finish(). */
export function createGameStatsAccumulator(asOf: number) {
  const totals = blankTotals();
  const firstDay = dayNumber(asOf) - 89;
  const daily = Array.from({ length: 90 }, (_, i) => ({
    day: new Date((firstDay + i) * DAY).toISOString().slice(0, 10),
    totals: blankTotals(),
  }));
  const seen = new Set<string>();
  const registrations = new Map<string, number>();
  const add = (
    metric: GameStatsMetric,
    values: number[],
    time: number,
    lifetime = true,
  ) => {
    const bucket = daily[dayNumber(time) - firstDay];
    values.forEach((value, index) => {
      const sum = (before: number) => {
        if (GAME_STATS_DEFINITIONS[metric].series[index].unit !== "HIVE")
          return before + value;
        const milli = Math.round(before * 1000) + Math.round(value * 1000);
        if (!Number.isSafeInteger(milli))
          throw new Error("Statistics amount overflow");
        return milli / 1000;
      };
      if (lifetime) totals[metric][index] = sum(totals[metric][index]);
      if (bucket)
        bucket.totals[metric][index] = sum(bucket.totals[metric][index]);
    });
  };
  return {
    accept(log: AnalyticsLogRecord, receipt: AnalyticsReceipt | undefined) {
      const key = analyticsReceiptKey(log);
      if (
        !key ||
        !receipt ||
        receipt.key !== key ||
        receipt.wallet !== log.wallet ||
        !Number.isFinite(log.createdAt) ||
        log.createdAt < 0 ||
        log.createdAt > asOf
      )
        return;
      const game = receipt.type === "game_action";
      if (
        game &&
        (!Number.isSafeInteger(receipt.operationIndex) ||
          receipt.operationIndex! < 0 ||
          !key.endsWith(`:${receipt.operationIndex}`))
      )
        return;
      const data = log.data ?? {};
      if (data.action === "refunded") return;
      const expectedActions: Partial<
        Record<AnalyticsLogRecord["type"], string>
      > = {
        claim: "claim",
        raid: "raid",
        chest: "open_chest",
        salvage: "salvage_equipment",
        stat_upgrade: "upgrade_stat",
        upgrade: "upgrade_equipment",
      };
      if (
        game &&
        (!expectedActions[log.type] ||
          receipt.action !== expectedActions[log.type])
      )
        return;
      const expectedPayments: Partial<
        Record<AnalyticsLogRecord["type"], string>
      > = {
        registration: "registration",
        deposit: "deposit",
        withdrawal: "withdrawal",
        market: "market_purchase",
      };
      if (!game && receipt.type !== expectedPayments[log.type]) return;
      if (
        log.type === "market" &&
        (data.currency !== "HIVE" ||
          receipt.currency !== "HIVE" ||
          data.action !== "bought")
      )
        return;
      if (["chest", "salvage", "upgrade", "market"].includes(log.type)) {
        if (typeof data.itemId !== "string" || !data.itemId) return;
        if (receipt.itemId && receipt.itemId !== data.itemId) return;
      }
      const fingerprint = JSON.stringify([
        log.type,
        key,
        data.itemId ?? null,
        log.type === "upgrade" ? [data.from, data.to] : null,
      ]);
      if (seen.has(fingerprint)) return;
      const amount = log.amount;
      const finiteAmount =
        typeof amount === "number" && Number.isFinite(amount);
      let metric: GameStatsMetric;
      let values: number[];
      switch (log.type) {
        case "registration": {
          const previous = registrations.get(log.wallet);
          if (previous !== undefined && previous <= log.createdAt) return;
          if (previous !== undefined)
            add("registrations", [-1], previous, false);
          registrations.set(log.wallet, log.createdAt);
          seen.add(fingerprint);
          add("registrations", [1], log.createdAt, previous === undefined);
          return;
        }
        case "claim":
          if (!finiteAmount || amount! <= 0) return;
          metric = "claimed";
          values = [amount!, 1];
          break;
        case "raid":
          if (typeof data.success !== "boolean" || !finiteAmount || amount! < 0)
            return;
          seen.add(fingerprint);
          add("raids", [1, data.success ? 1 : 0], log.createdAt);
          if (data.success) add("stolen", [amount!, 1], log.createdAt);
          return;
        case "chest":
          metric = "chests";
          values = [1];
          break;
        case "salvage":
          if (!finiteAmount || amount! < 0) return;
          metric = "salvage";
          values = [amount!, 1];
          break;
        case "stat_upgrade":
        case "upgrade": {
          const from = data.from,
            to = data.to;
          if (
            !finiteAmount ||
            amount! > 0 ||
            !Number.isSafeInteger(from) ||
            !Number.isSafeInteger(to) ||
            (from as number) < 0 ||
            (to as number) <= (from as number)
          )
            return;
          const levels = (to as number) - (from as number);
          if (log.type === "stat_upgrade" && data.levels !== levels) return;
          if (log.type === "upgrade" && levels !== 1) return;
          metric =
            log.type === "stat_upgrade"
              ? "stat-upgrades"
              : "equipment-upgrades";
          values = [-amount!, levels];
          break;
        }
        case "market":
          if (
            !finiteAmount ||
            amount! >= 0 ||
            !hiveAmountSchema.safeParse(-amount!).success
          )
            return;
          metric = "market-sales";
          values = [1, -amount!];
          break;
        case "deposit":
          if (!finiteAmount || amount! <= 0) return;
          metric = "deposits";
          values = [amount!, 1];
          break;
        case "withdrawal":
          if (!finiteAmount || amount! >= 0 || data.action === "refunded")
            return;
          metric = "withdrawals";
          values = [-amount!, 1];
          break;
        default:
          return;
      }
      seen.add(fingerprint);
      add(metric, values, log.createdAt);
    },
    finish(): GameStatsAggregate {
      for (const values of [totals, ...daily.map((point) => point.totals)]) {
        for (const metric of GAME_STATS_METRICS)
          values[metric].forEach((value, index) => {
            if (
              !Number.isFinite(value) ||
              value < 0 ||
              (GAME_STATS_DEFINITIONS[metric].series[index].unit === "count" &&
                !Number.isSafeInteger(value))
            )
              throw new Error("Invalid statistics aggregate");
          });
      }
      return { asOf, totals, daily };
    },
  };
}

export function toGameStatsSummary(
  aggregate: GameStatsAggregate,
  mining: GameStatsSummaryDto["mining"],
): GameStatsSummaryDto {
  return {
    ok: true,
    kind: "summary",
    asOf: aggregate.asOf,
    mining: {
      registeredPlayers: mining.registeredPlayers,
      hashPerSecond: mining.hashPerSecond,
      hashPerDay: mining.hashPerDay,
    },
    totals: Object.fromEntries(
      GAME_STATS_METRICS.map((metric) => [
        metric,
        [...aggregate.totals[metric]],
      ]),
    ) as GameStatsSummaryDto["totals"],
  };
}
export function toGameStatsDaily(
  aggregate: GameStatsAggregate,
  metric: GameStatsMetric,
  days: 7 | 30 | 90,
): GameStatsDailyDto {
  const points = aggregate.daily
    .slice(-days)
    .map((point) => ({ day: point.day, values: [...point.totals[metric]] }));
  const totals = GAME_STATS_DEFINITIONS[metric].series.map((series, index) => {
    if (series.unit === "HIVE") {
      const milli = points.reduce(
        (total, point) => total + Math.round(point.values[index] * 1000),
        0,
      );
      if (!Number.isSafeInteger(milli))
        throw new Error("Statistics amount overflow");
      return milli / 1000;
    }
    return points.reduce((total, point) => total + point.values[index], 0);
  });
  return {
    ok: true,
    kind: "daily",
    asOf: aggregate.asOf,
    metric,
    series: GAME_STATS_DEFINITIONS[metric].series.map(({ label, unit }) => ({
      label,
      unit,
    })),
    days,
    points,
    totals,
  };
}
