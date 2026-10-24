import { describe, expect, it } from "vitest";

import { CONSUMABLES } from "./consumables";
import {
  HELP_UNAVAILABLE_MESSAGE,
  NO_ITEM_MESSAGE,
  SABOTAGE_ACTIVE_MESSAGE,
  consumableIdsOfKind,
  socialActionState,
} from "./social-ui";

describe("socialActionState", () => {
  it("gates Help on the target being sabotaged, regardless of owned items", () => {
    const state = socialActionState({
      kind: "help",
      helpBlockedByOwnSabotage: false,
      sabotageActive: false,
      ownedQuantity: 5,
    });
    expect(state).toEqual({
      canUse: false,
      blockedBy: "not_sabotaged",
      message: HELP_UNAVAILABLE_MESSAGE,
    });
    expect(HELP_UNAVAILABLE_MESSAGE).toBe(
      "Not available. This player is not currently sabotaged.",
    );
  });

  it("enables Help only when the target is sabotaged and an item is owned", () => {
    expect(
      socialActionState({
        kind: "help",
        helpBlockedByOwnSabotage: false,
        sabotageActive: true,
        ownedQuantity: 1,
      }).canUse,
    ).toBe(true);
    const none = socialActionState({
      kind: "help",
      helpBlockedByOwnSabotage: false,
      sabotageActive: true,
      ownedQuantity: 0,
    });
    expect(none).toMatchObject({
      canUse: false,
      blockedBy: "no_item",
      message: NO_ITEM_MESSAGE,
    });
  });

  it("disables Sabotage when none are owned", () => {
    const state = socialActionState({
      kind: "sabotage",
      sabotageActive: false,
      ownedQuantity: 0,
    });
    expect(state).toMatchObject({ canUse: false, blockedBy: "no_item" });
  });

  it.each([
    [true, "own_sabotage"],
    [undefined, "eligibility_unknown"],
  ] as const)("blocks Help with eligibility %s", (value, blockedBy) => {
    expect(
      socialActionState({
        kind: "help",
        sabotageActive: true,
        ownedQuantity: 2,
        helpBlockedByOwnSabotage: value,
      }),
    ).toMatchObject({ canUse: false, blockedBy });
  });

  it("enables Sabotage with an item on an unsabotaged target", () => {
    expect(
      socialActionState({
        kind: "sabotage",
        sabotageActive: false,
        ownedQuantity: 2,
      }),
    ).toEqual({
      canUse: true,
      blockedBy: null,
      message: null,
    });
  });

  it("disables Sabotage on an already-sabotaged target", () => {
    const state = socialActionState({
      kind: "sabotage",
      sabotageActive: true,
      ownedQuantity: 2,
    });
    expect(state).toMatchObject({
      canUse: false,
      blockedBy: "already_sabotaged",
      message: SABOTAGE_ACTIVE_MESSAGE,
    });
  });
});

describe("consumableIdsOfKind", () => {
  it("returns only items of the requested kind", () => {
    for (const kind of ["sabotage", "help"] as const) {
      const ids = consumableIdsOfKind(kind);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => CONSUMABLES[id].kind === kind)).toBe(true);
    }
  });
});
