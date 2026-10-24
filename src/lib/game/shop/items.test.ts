import { describe, expect, it } from "vitest";
import { HeroRarity } from "@/game/data/HeroRarity";
import { SHOP_ITEMS, SHOP_ITEM_BY_ID } from "./items";

describe("shop catalog", () => {
  it("every item has a positive coin price", () => {
    for (const item of SHOP_ITEMS) expect(item.price).toBeGreaterThan(0);
  });

  it("every chest maps to a valid hero rarity", () => {
    for (const item of SHOP_ITEMS)
      expect(Object.values(HeroRarity)).toContain(item.heroRarity);
  });

  it("item ids are unique and match the chest artwork", () => {
    const ids = SHOP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SHOP_ITEMS) expect(item.image).toContain(item.id);
  });

  it("the lookup covers every catalog entry", () => {
    for (const item of SHOP_ITEMS) expect(SHOP_ITEM_BY_ID[item.id]).toBe(item);
  });
});
