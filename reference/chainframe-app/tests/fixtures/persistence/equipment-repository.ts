// Focused equipment fixture repository.
import { gameActionNow } from "@/lib/utils/game/execution-context.server";
import type { EquipmentRecord, EquipmentRepository } from "./types";
import { getFixtureState } from "./store";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Mirrors the reference forge formula: x1.05 per level, rounded to 1 decimal. */
function upgradedStats(
  stats: EquipmentRecord["stats"],
): EquipmentRecord["stats"] {
  const next: EquipmentRecord["stats"] = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "number") {
      next[key as keyof EquipmentRecord["stats"]] =
        Math.round(value * 1.05 * 10) / 10;
    }
  }
  return next;
}

export function createFixtureEquipmentRepository(): EquipmentRepository {
  return {
    async findByIds(ids) { return [...getFixtureState().equipments.values()].filter(item => ids.includes(item.id)).map(clone); },
    async listForSale(id, owner, price) {
      const item = getFixtureState().equipments.get(id);
      if (!item || item.owner !== owner || item.salvaged || item.equipped)
        return { ok: false, error: "Item is unavailable" };
      item.market = { price, isMarket: true, listedAt: gameActionNow() };
      return { ok: true };
    },
    async cancelListing(id, owner) {
      const item = getFixtureState().equipments.get(id);
      if (!item || item.owner !== owner || !item.market?.isMarket)
        return { ok: false, error: "Listing not found" };
      item.market = null;
      return { ok: true };
    },
    async equip(id, owner) {
      const item = getFixtureState().equipments.get(id);
      if (
        !item ||
        item.owner !== owner ||
        item.salvaged ||
        item.market?.isMarket
      )
        return { ok: false, error: "Item is unavailable" };
      for (const other of getFixtureState().equipments.values())
        if (other.owner === owner && other.slot === item.slot)
          other.equipped = false;
      item.equipped = true;
      return { ok: true, item: clone(item) };
    },
    async unequip(id, owner) {
      const item = getFixtureState().equipments.get(id);
      if (!item || item.owner !== owner || item.salvaged)
        return { ok: false, error: "Item is unavailable" };
      item.equipped = false;
      return { ok: true, item: clone(item) };
    },
    async salvage(id, owner) {
      const item = getFixtureState().equipments.get(id);
      if (
        !item ||
        item.owner !== owner ||
        item.salvaged ||
        item.equipped ||
        item.market?.isMarket
      )
        return { ok: false, error: "Item is unavailable" };
      item.salvaged = true;
      item.owner = null;
      item.market = null;
      return { ok: true, item: clone(item) };
    },
    async findById(id) {
      const item = getFixtureState().equipments.get(id);
      return item ? clone(item) : null;
    },

    async insert(input) {
      const state = getFixtureState();
      const id = String(state.nextItemId++);
      const item: EquipmentRecord = { ...input, id };
      state.equipments.set(id, item);
      return clone(item);
    },

    async upgrade(id, owner) {
      const item = getFixtureState().equipments.get(id);
      if (
        !item ||
        item.owner !== owner ||
        item.salvaged ||
        item.market?.isMarket
      )
        return { ok: false, error: "Item is unavailable" };
      item.stats = upgradedStats(item.stats);
      item.level += 1;
      return { ok: true, item: clone(item) };
    },
  };
}
