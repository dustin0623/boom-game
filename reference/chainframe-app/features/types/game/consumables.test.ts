import { describe, expect, it } from "vitest";
import {
  CONSUMABLES,
  CONSUMABLE_IDS,
  consumableQuantity,
  isConsumableId,
} from "./consumables";

describe("consumable catalog", () => {
  it("defines sabotage and help items with matching ids", () => {
    expect(CONSUMABLES["sabotage-device"].kind).toBe("sabotage");
    expect(CONSUMABLES["help-kit"].kind).toBe("help");
    for (const id of CONSUMABLE_IDS) {
      expect(CONSUMABLES[id].id).toBe(id);
      expect(CONSUMABLES[id].basePrice).toBeGreaterThan(0);
    }
  });

  it("recognises only catalog ids", () => {
    expect(isConsumableId("help-kit")).toBe(true);
    expect(isConsumableId("a.b")).toBe(false);
    expect(isConsumableId(undefined)).toBe(false);
  });
});

describe("consumableQuantity", () => {
  it("defaults to zero", () => {
    expect(consumableQuantity(undefined, "help-kit")).toBe(0);
    expect(consumableQuantity({}, "help-kit")).toBe(0);
    expect(consumableQuantity({ "help-kit": 4 }, "help-kit")).toBe(4);
  });
});
