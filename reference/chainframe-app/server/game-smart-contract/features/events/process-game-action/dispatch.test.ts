import { describe, expect, it } from "vitest";

import { createGameActionRegistry } from "./dispatch";

const supportedActions = [
  "upgrade_stat",
  "upgrade_equipment",
  "claim",
  "increase_vault",
  "help",
  "sabotage",
  "raid",
  "equip",
  "unequip",
  "salvage_equipment",
  "open_chest",
  "purchase_chest",
  "purchase_consumable",
  "market_list",
  "market_cancel",
  "equip_cosmetic",
  "request_withdrawal",
] as const;

describe("game action adapter batches", () => {
  it("registers every supported action exactly once", () => {
    const registry = createGameActionRegistry();
    expect(Object.keys(registry).sort()).toEqual([...supportedActions].sort());
    for (const action of supportedActions)
      expect(registry[action]).toEqual(expect.any(Function));
  });

  it.each(supportedActions)("exposes a callable handler for %s", (action) => {
    const registry = createGameActionRegistry();
    expect(typeof registry[action]).toBe("function");
  });
});
