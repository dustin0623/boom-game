import { describe, expect, it } from "vitest";
import {
  createGameStatsAccumulator,
  toGameStatsDaily,
  toGameStatsSummary,
} from "./game-stats";
import type { AnalyticsLogRecord } from "@/lib/modules/logs/server.types";
import type { AnalyticsReceipt } from "@/lib/modules/transactions-processed/server.types";

const now = Date.parse("2026-10-14T12:00:00Z");
const log = (
  overrides: Partial<AnalyticsLogRecord> = {},
): AnalyticsLogRecord => ({
  id: "log",
  wallet: "alice",
  correlationKey: "action:2",
  type: "claim",
  amount: 0.3,
  createdAt: now,
  ...overrides,
});
const receipt = (
  overrides: Partial<AnalyticsReceipt> = {},
): AnalyticsReceipt => ({
  key: "action:2",
  wallet: "alice",
  type: "game_action",
  action: "claim",
  operationIndex: 2,
  ...overrides,
});
describe("completed activity aggregates", () => {
  it("rejects missing, wrong-actor, wrong-operation and wrong-action evidence", () => {
    const a = createGameStatsAccumulator(now);
    for (const evidence of [
      undefined,
      receipt({ wallet: "bob" }),
      receipt({ key: "other:2" }),
      receipt({ operationIndex: 1 }),
      receipt({ action: "raid" }),
    ])
      a.accept(log(), evidence);
    a.accept(log({ correlationKey: undefined }), receipt());
    expect(a.finish().totals.claimed).toEqual([0, 0]);
  });
  it("uses UTC execution dates, includes zero days and counts an operation once", () => {
    const a = createGameStatsAccumulator(now);
    const event = log({ createdAt: Date.parse("2026-10-13T23:59:59Z") });
    a.accept(event, receipt());
    a.accept({ ...event, id: "duplicate-log" }, receipt());
    a.accept(
      log({ correlationKey: "next:2", createdAt: now + 1 }),
      receipt({ key: "next:2" }),
    );
    const daily = toGameStatsDaily(a.finish(), "claimed", 7);
    expect(daily.points).toHaveLength(7);
    expect(daily.points[0]).toEqual({ day: "2026-10-08", values: [0, 0] });
    expect(daily.points[5]).toEqual({ day: "2026-10-13", values: [0.3, 1] });
    expect(daily.points[6]).toEqual({ day: "2026-10-14", values: [0, 0] });
    expect(daily.totals).toEqual([0.3, 1]);
  });
  it("uses the actual raid credit and counts a completed loss without adding theft", () => {
    const a = createGameStatsAccumulator(now);
    a.accept(
      log({
        type: "raid",
        amount: 2,
        data: { success: true, takenFromVault: 20, destroyed: 18 },
      }),
      receipt({ action: "raid" }),
    );
    a.accept(
      log({
        type: "raid",
        correlationKey: "loss:2",
        amount: 0,
        data: { success: false, riskAmount: 9 },
      }),
      receipt({ key: "loss:2", action: "raid" }),
    );
    expect(a.finish().totals.stolen).toEqual([2, 1]);
    expect(a.finish().totals.raids).toEqual([2, 1]);
  });
  it("counts actual chest opening and excludes purchase receipts even for chests", () => {
    const a = createGameStatsAccumulator(now);
    a.accept(
      log({ type: "chest", data: { itemId: "hash-item" } }),
      receipt({ action: "open_chest" }),
    );
    a.accept(
      log({
        type: "chest",
        correlationKey: "payment",
        data: { itemId: "hive-item" },
      }),
      receipt({
        key: "payment",
        type: "shop_purchase",
        shopKind: "chest",
        itemId: "hive-item",
      }),
    );
    a.accept(
      log({
        type: "chest",
        correlationKey: "consumable",
        data: { itemId: "fake-item" },
      }),
      receipt({
        key: "consumable",
        type: "shop_purchase",
        shopKind: "consumable",
      }),
    );
    expect(a.finish().totals.chests).toEqual([1]);
  });
  it("keeps recorded salvage and upgrade currencies and preserves bulk equipment steps", () => {
    const a = createGameStatsAccumulator(now);
    a.accept(
      log({ type: "salvage", amount: 1.25, data: { itemId: "item" } }),
      receipt({ action: "salvage_equipment", itemId: "item" }),
    );
    a.accept(
      log({
        type: "stat_upgrade",
        correlationKey: "stat:2",
        amount: -13,
        data: { from: 1, to: 3, levels: 2 },
      }),
      receipt({ key: "stat:2", action: "upgrade_stat" }),
    );
    const equipment = receipt({
      key: "gear:2",
      action: "upgrade_equipment",
      itemId: "item",
    });
    for (const from of [1, 2, 2])
      a.accept(
        log({
          type: "upgrade",
          correlationKey: "gear:2",
          amount: -0.5,
          data: { itemId: "item", from, to: from + 1 },
        }),
        equipment,
      );
    expect(a.finish().totals.salvage).toEqual([1.25, 1]);
    expect(a.finish().totals["stat-upgrades"]).toEqual([13, 2]);
    expect(a.finish().totals["equipment-upgrades"]).toEqual([1, 2]);
  });
  it("deduplicates paid registrations per wallet and retains its first completed day", () => {
    const a = createGameStatsAccumulator(now);
    a.accept(
      log({
        type: "registration",
        wallet: "bob",
        correlationKey: "refund",
        data: { action: "refunded" },
      }),
      receipt({ key: "refund", wallet: "bob", type: "registration" }),
    );
    const paid = receipt({ key: "paid", type: "registration" });
    a.accept(
      log({
        type: "registration",
        correlationKey: "paid",
        amount: 100,
        data: { startingHash: 10 },
      }),
      paid,
    );
    a.accept(
      log({
        type: "registration",
        correlationKey: "earlier",
        createdAt: now - 86400000,
      }),
      receipt({ key: "earlier", type: "registration" }),
    );
    expect(a.finish().totals.registrations).toEqual([1]);
    expect(a.finish().totals.claimed).toEqual([0, 0]);
    expect(a.finish().totals.deposits).toEqual([0, 0]);
    expect(
      toGameStatsDaily(a.finish(), "registrations", 7).points.slice(-2),
    ).toEqual([
      { day: "2026-10-13", values: [1] },
      { day: "2026-10-14", values: [0] },
    ]);
  });
  it("separates current HIVE purchases, deposits and payouts from refunds and queued requests", () => {
    const a = createGameStatsAccumulator(now);
    const market = log({
      type: "market",
      correlationKey: "market",
      amount: -0.1,
      data: { action: "bought", currency: "HIVE", itemId: "item" },
    });
    const sale = receipt({
      key: "market",
      type: "market_purchase",
      currency: "HIVE",
      itemId: "item",
    });
    a.accept(market, sale);
    a.accept(
      { ...market, correlationKey: "market2", amount: -0.2 },
      { ...sale, key: "market2" },
    );
    a.accept(
      { ...market, correlationKey: "too-precise", amount: -0.1004 },
      { ...sale, key: "too-precise" },
    );
    a.accept(
      {
        ...market,
        correlationKey: "hash",
        data: { ...market.data, currency: "HASH" },
      },
      { ...sale, key: "hash" },
    );
    a.accept(
      {
        ...market,
        correlationKey: "refund",
        data: { ...market.data, action: "refunded" },
      },
      { ...sale, key: "refund" },
    );
    a.accept(
      log({ type: "deposit", correlationKey: "deposit", amount: 4 }),
      receipt({ key: "deposit", type: "deposit" }),
    );
    a.accept(
      log({ type: "withdrawal", correlationKey: "payout", amount: -3 }),
      receipt({ key: "payout", type: "withdrawal" }),
    );
    a.accept(
      log({ type: "withdrawal", correlationKey: "queue:2", amount: -9 }),
      receipt({ key: "queue:2", action: "request_withdrawal" }),
    );
    a.accept(
      log({ type: "withdrawal", correlationKey: "compensation", amount: 3 }),
      receipt({ key: "compensation", type: "withdrawal" }),
    );
    expect(a.finish().totals["market-sales"]).toEqual([2, 0.3]);
    expect(a.finish().totals.deposits).toEqual([4, 1]);
    expect(a.finish().totals.withdrawals).toEqual([3, 1]);
  });
  it("returns aggregates without internal identities or mining history", () => {
    const a = createGameStatsAccumulator(now);
    a.accept(log(), receipt());
    const summary = toGameStatsSummary(a.finish(), {
      registeredPlayers: 2,
      hashPerSecond: 0.0001,
      hashPerDay: 8.64,
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /alice|action:2|correlationKey|operationIndex|seed/,
    );
    expect(summary.mining.hashPerDay).toBe(8.64);
    expect(Object.keys(summary.totals)).not.toContain("emission");
  });
});
