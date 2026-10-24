import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHEST_LADDERS,
  CHEST_ODDS,
  CHESTS,
  EQUIPMENT_CHEST_BASE_PRICE,
  EQUIPMENT_CHEST_ID,
  EQUIPMENT_CHEST_ODDS,
  RARITY_KEYS,
} from "@/lib/config/constants/game";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Equipment Chest config", () => {
  it("uses the canonical id and a positive base price", () => {
    expect(EQUIPMENT_CHEST_ID).toBe("equipment");
    expect(EQUIPMENT_CHEST_BASE_PRICE).toBeGreaterThan(0);
    expect(CHESTS.equipment.label).toBe("Equipment Chest");
  });

  it("defines a positive chance for every supported rarity", () => {
    expect(Object.keys(EQUIPMENT_CHEST_ODDS).sort()).toEqual(
      [...RARITY_KEYS].sort(),
    );
    for (const rarity of RARITY_KEYS) {
      expect(EQUIPMENT_CHEST_ODDS[rarity]).toBeGreaterThan(0);
    }
  });

  it("totals exactly 100 percent", () => {
    const total = RARITY_KEYS.reduce(
      (sum, rarity) => sum + EQUIPMENT_CHEST_ODDS[rarity],
      0,
    );
    expect(total).toBeCloseTo(100, 9);
  });

  it("derives a strictly increasing ladder that ends open-ended", () => {
    const ladder = CHEST_LADDERS.equipment;
    expect(ladder.map((step) => step.rarity)).toEqual(RARITY_KEYS);
    const bounded = ladder.slice(0, -1).map((step) => step.max);
    expect([...bounded].sort((a, b) => a - b)).toEqual(bounded);
    expect(new Set(bounded).size).toBe(bounded.length);
    expect(bounded.at(-1)).toBeLessThan(100_000);
    expect(ladder.at(-1)?.max).toBe(Infinity);
  });

  it("exposes displayed odds that match the configured odds", () => {
    for (const rarity of RARITY_KEYS) {
      expect(CHEST_ODDS.equipment[rarity]).toBeCloseTo(
        EQUIPMENT_CHEST_ODDS[rarity],
        6,
      );
    }
  });
});
