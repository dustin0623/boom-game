import { describe, it, expect } from "vitest";
import {
  itemUpgradeCost,
  salvageValue,
  upgradedStats,
  UPGRADE_MULTIPLIER,
  UPGRADE_RATE,
} from "./items";

const stats = {
  hackPower: 10,
  security: 10,
  hashRate: 0,
  firewall: 0,
  exploit: 0,
  luck: 0,
};

describe("salvageValue", () => {
  it("weights combat stats at 0.5 and flat stats at 5 or 10", () => {
    // hackPower*0.5 + security*0.5 = 5 + 5 = 10
    expect(salvageValue({ stats, level: 1 })).toBe(10);
  });

  it("ignores stats that aren't rolled on the item", () => {
    expect(salvageValue({ stats: {}, level: 1 })).toBe(0);
  });

  it.each([
    ["hashRate", 5],
    ["firewall", 5],
    ["exploit", 5],
    ["luck", 10],
  ] as const)("weights %s at %d", (key, weight) => {
    expect(salvageValue({ stats: { [key]: 2 }, level: 1 })).toBe(2 * weight);
  });
});

describe("itemUpgradeCost", () => {
  it("matches the forge formula: salvageValue * 0.0498 * level", () => {
    expect(itemUpgradeCost({ stats, level: 2 })).toBeCloseTo(
      10 * UPGRADE_RATE * 2,
      5,
    );
  });

  it("scales linearly with level", () => {
    const level1 = itemUpgradeCost({ stats, level: 1 });
    const level4 = itemUpgradeCost({ stats, level: 4 });
    expect(level4).toBeCloseTo(level1 * 4, 5);
  });
});

describe("upgradedStats", () => {
  it("multiplies every rolled stat by the upgrade multiplier", () => {
    const next = upgradedStats({ hashRate: 10 });
    expect(next.hashRate).toBeCloseTo(10 * UPGRADE_MULTIPLIER, 5);
  });

  it("leaves unrolled stats untouched (absent)", () => {
    const next = upgradedStats({ hashRate: 10 });
    expect(next.security).toBeUndefined();
  });
});
