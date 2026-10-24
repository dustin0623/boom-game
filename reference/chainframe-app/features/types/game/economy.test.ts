import { describe, expect, it } from "vitest";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import { withdrawalCapacity } from "./economy";

describe("withdrawalCapacity", () => {
  it.each([
    [0, 10],
    [100, 20],
    [1_000, 110],
    [10_000, 1_010],
    [100_000, 10_010],
    [1_000_000, 100_010],
  ])("notoriety %i -> %i HASH per day", (notoriety, expected) => {
    expect(withdrawalCapacity(notoriety)).toBeCloseTo(expected, 6);
  });

  it("returns the base capacity for invalid or negative notoriety", () => {
    expect(withdrawalCapacity(-50)).toBe(10);
    expect(withdrawalCapacity(Number.NaN)).toBe(10);
    expect(withdrawalCapacity(Number.POSITIVE_INFINITY)).toBe(10);
  });

  it("is fractional when notoriety is not a multiple of 10", () => {
    expect(withdrawalCapacity(5)).toBeCloseTo(10.5, 6);
  });
});

describe("SOCIAL_ECONOMY", () => {
  it("keeps exposure bounds consistent", () => {
    expect(SOCIAL_ECONOMY.raidExposureMin).toBeLessThan(
      SOCIAL_ECONOMY.raidExposureMax,
    );
    expect(SOCIAL_ECONOMY.raidExposureMax).toBeLessThanOrEqual(
      SOCIAL_ECONOMY.raidExposureCap,
    );
  });

  it("does not define any crit stat", () => {
    const keys = Object.keys(SOCIAL_ECONOMY).join(",").toLowerCase();
    expect(keys).not.toContain("critchance");
    expect(keys).not.toContain("criticalchance");
    expect(keys).not.toContain("critmultiplier");
  });
});
