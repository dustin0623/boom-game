import { describe, expect, it } from "vitest";
import type { IPlayer } from "@/lib/modules/players/server.types";
import type { StatEffect } from "@/features/types/game/stat-effects";
import { toRaidTarget } from "./raid-targets";

const effect: StatEffect = {
  stat: "security",
  itemId: "sabotage-device",
  appliedBy: "alice",
  appliedAt: 1,
  active: true,
  strength: 0.5,
  critical: false,
  helps: [],
};
const player = {
  wallet: "bob",
  username: "bob",
  level: 1,
  vault: 0,
  vaultStaked: 0,
  lastTickAt: 1000,
  lastSinkAt: 1000,
  notoriety: 0,
  statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
  statEffects: { security: effect },
} as unknown as IPlayer;

describe("raid target Help eligibility", () => {
  it("is viewer-specific without exposing private sabotage evidence", () => {
    const own = toRaidTarget(player, "alice", 1000);
    expect(own.helpBlockedByOwnSabotage).toBe(true);
    expect(toRaidTarget(player, "carol", 1000).helpBlockedByOwnSabotage).toBe(false);
    expect(own.activeEffects).toEqual({ security: 0.5 });
    const json = JSON.stringify(own);
    for (const privateValue of [
      "alice",
      "appliedBy",
      "appliedAt",
      "itemId",
      "sabotage-device",
      "statEffects",
    ])
      expect(json).not.toContain(privateValue);
  });

  it("unblocks fully countered and cleared effects", () => {
    const countered = {
      ...effect,
      helps: [
        {
          itemId: "help-kit" as const,
          appliedBy: "carol",
          appliedAt: 2,
          strength: 0.5,
          critical: false,
        },
      ],
    };
    expect(
      toRaidTarget(
        { ...player, statEffects: { security: countered } } as IPlayer,
        "alice",
        1000,
      ).helpBlockedByOwnSabotage,
    ).toBe(false);
    expect(
      toRaidTarget({ ...player, statEffects: {} } as IPlayer, "alice", 1000)
        .helpBlockedByOwnSabotage,
    ).toBe(false);
  });
});
