import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  values: new Map<string, number>(),
  get: vi.fn(),
  max: vi.fn(),
  increment: vi.fn(),
}));
vi.mock("@/lib/modules/game-stats/server.repository", () => ({
  gameStatsRepository: {
    get: state.get,
    setMax: state.max,
    increment: state.increment,
  },
}));
import {
  getPricingEmission,
  resetPricingEmissionCache,
} from "./emission.server";
import {
  emissionDayKey,
  HIGH_WATER_KEY,
  LAST_RATCHET_KEY,
  utcDayNumber,
} from "@/lib/utils/game/pricing";
const today = Date.parse("2026-10-12T00:00:00Z"),
  day = utcDayNumber(today),
  DAY_MS = 86_400_000;
beforeEach(() => {
  vi.clearAllMocks();
  state.values.clear();
  resetPricingEmissionCache();
  state.get.mockImplementation(
    async (key: string) => state.values.get(key) ?? null,
  );
  state.max.mockImplementation(async (key: string, value: number) => {
    const next = Math.max(state.values.get(key) ?? 0, value);
    state.values.set(key, next);
    return next;
  });
});
describe("completed-day price ratchet", () => {
  it("ignores current-day claims and caches the completed-day tier until UTC midnight", async () => {
    state.values.set(emissionDayKey(day - 1), 101_000);
    state.values.set(emissionDayKey(day), 200_000);
    expect(await getPricingEmission(today)).toEqual({
      yesterday: 101_000,
      highWater: 101_000,
      day,
    });
    const reads = state.get.mock.calls.length;
    expect(await getPricingEmission(today + DAY_MS - 1)).toEqual({
      yesterday: 101_000,
      highWater: 101_000,
      day,
    });
    expect(state.get).toHaveBeenCalledTimes(reads);
    expect(await getPricingEmission(today + DAY_MS)).toEqual({
      yesterday: 200_000,
      highWater: 200_000,
      day: day + 1,
    });
  });
  it("retains a higher completed day's price tier after a lower-emission day", async () => {
    state.values.set(HIGH_WATER_KEY, 200_000);
    state.values.set(LAST_RATCHET_KEY, day - 2);
    state.values.set(emissionDayKey(day - 1), 50_000);
    expect(await getPricingEmission(today)).toEqual({
      yesterday: 50_000,
      highWater: 200_000,
      day,
    });
  });
  it("keeps the peak from missed completed days when catching up", async () => {
    state.values.set(LAST_RATCHET_KEY, day - 4);
    state.values.set(emissionDayKey(day - 3), 150_000);
    state.values.set(emissionDayKey(day - 2), 300_000);
    state.values.set(emissionDayKey(day - 1), 10_000);
    expect((await getPricingEmission(today)).highWater).toBe(300_000);
    expect(state.values.get(LAST_RATCHET_KEY)).toBe(day - 1);
  });
});
