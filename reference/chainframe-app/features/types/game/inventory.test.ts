import { describe, expect, it } from "vitest";
import { registrationStarterItems, publicStartingItems } from "./inventory";
import { REGISTRATION_STARTER_STARTS_AT as start, REGISTRATION_STARTER_ENDS_AT as end, EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";

const expectedStarterItems = [
  { itemId: EQUIPMENT_CHEST_ID, quantity: 4 },
  { itemId: "sabotage-device", quantity: 10 },
  { itemId: "help-kit", quantity: 10 },
];
describe("registration starter items", () => {
  it.each([[start - 1, false], [start, true], [start + 1, true], [end - 1, true], [end, false], [end + 1, false]])("uses verified payment boundary %s", (time, eligible) => {
    expect(registrationStarterItems(time as number)).toEqual(eligible ? expectedStarterItems : []);
  });
  it("keeps the event at precisely fourteen days with fresh returned values", () => {
    expect(end - start).toBe(14 * 86400000);
    const items = registrationStarterItems(start);
    items[0].quantity = 99;
    expect(registrationStarterItems(start)).toEqual(expectedStarterItems);
  });
  it.each([NaN, Infinity, -Infinity])("rejects unavailable payment time %s", (time) => {
    expect(() => registrationStarterItems(time)).toThrow("Invalid registration payment time");
  });
  it("filters unknown evidence and private nested fields without inventing awards", () => {
    expect(publicStartingItems(undefined)).toBeUndefined();
    expect(publicStartingItems([{ itemId: "help-kit", quantity: 10, seed: "private" }, { itemId: "help-kit", quantity: 10 }, { itemId: "unknown", quantity: 4 }, { itemId: EQUIPMENT_CHEST_ID, quantity: 0 }])).toEqual([{ itemId: "help-kit", quantity: 10 }]);
  });
});
