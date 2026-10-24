import { EQUIPMENT_STATS_EFFECTIVE_AT } from "@/lib/config/constants/game";
import { miningPerSecond } from "@/features/types/game/mining";
import { vi } from "vitest";
import { describe, it, expect } from "vitest";
import type { IPlayer, PlayerRecord } from "@/lib/modules/players/server.types";

import { tickPlayer, tickPatch } from "./action";
import { toRaidTarget } from "@/lib/api/dto/raid-targets";
import { resolvedPlayerStats } from "@/features/types/game/stats";
import { vaultCapacity } from "@/features/types/game/mining";

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  const base = {
    wallet: "0xWALLET",
    vault: 0,
    vaultStaked: 0,
    lastTickAt: Date.now() - 10_000,
    lastSinkAt: Date.now(),
    statLevels: {
      hashRate: 10,
      hackPower: 0,
      security: 0,
      luck: 0,
      firewall: 0,
      exploit: 0,
    },
    stats: {
      hashRate: 10,
      hackPower: 0,
      security: 0,
      luck: 0,
      firewall: 0,
      exploit: 0,
    },
    version: 0,
    milestones: {
      totalClaimed: 0,
      totalMined: 0,
      raids: 0,
      raidWins: 0,
      totalStolen: 0,
      bestHashRate: 1,
    },
  };
  return { ...base, ...overrides } as unknown as PlayerRecord;
}

describe("tickPlayer", () => {
  it("mines HASH proportional to elapsed time since lastTickAt", () => {
    const now = Date.now();
    const player = makePlayer({ lastTickAt: now - 10_000 });

    const { player: updated, mined } = tickPlayer(player);

    expect(mined).toBeGreaterThan(0);
    expect(updated.vault).toBeCloseTo(mined, 6);
    expect(updated.lastTickAt).toBeGreaterThanOrEqual(now);
  });

  it("does not mine negative or backwards time when lastTickAt is in the future", () => {
    const player = makePlayer({ lastTickAt: Date.now() + 10_000, vault: 0 });

    const { mined } = tickPlayer(player);

    expect(mined).toBe(0);
  });

  it("clamps mined vault to capacity", () => {
    const player = makePlayer({
      lastTickAt: Date.now() - 1_000_000_000, // huge elapsed time to force overflow
      vault: 0,
      vaultStaked: 0,
    });

    const { player: updated } = tickPlayer(player);

    // VAULT_BASE_CAPACITY + vaultStaked is the cap; vault should never exceed it.
    expect(updated.vault).toBe(vaultCapacity(player.vaultStaked));
    expect(Number.isFinite(updated.vault)).toBe(true);
  });

  it("recomputes stats from statLevels", () => {
    const player = makePlayer({
      statLevels: {
        hashRate: 42,
        hackPower: 1,
        security: 2,
        luck: 3,
        firewall: 4,
        exploit: 5,
      },
    });

    const { player: updated } = tickPlayer(player);

    expect(updated.stats).toEqual({
      hashRate: 42,
      hackPower: 10,
      security: 20,
      luck: 0,
      firewall: 1,
      exploit: 1,
    });
  });

  it("increments version and updates milestones.totalMined by the amount mined", () => {
    const player = makePlayer({
      lastTickAt: Date.now() - 10_000,
      version: 3,
      milestones: {
        totalClaimed: 0,
        totalMined: 100,
        raids: 0,
        raidWins: 0,
        totalStolen: 0,
        bestHashRate: 1,
      },
    });

    const { player: updated, mined } = tickPlayer(player);

    expect(updated.version).toBe(4);
    expect(updated.milestones.totalMined).toBeCloseTo(100 + mined, 6);
  });

  it("raises milestones.bestHashRate when vault exceeds the previous best", () => {
    const player = makePlayer({
      lastTickAt: Date.now() - 10_000,
      vault: 0,
      milestones: {
        totalClaimed: 0,
        totalMined: 0,
        raids: 0,
        raidWins: 0,
        totalStolen: 0,
        bestHashRate: 0,
      },
    });

    const { player: updated } = tickPlayer(player);

    expect(updated.milestones.bestHashRate).toBe(updated.vault);
  });
});

describe("tickPatch", () => {
  it("returns only the fields tickPlayer touches, scoped for a $set", () => {
    const player = makePlayer({
      vault: 12.5,
      lastTickAt: 999,
      version: 7,
      milestones: {
        totalClaimed: 0,
        totalMined: 50,
        raids: 0,
        raidWins: 0,
        totalStolen: 0,
        bestHashRate: 12.5,
      },
    });

    expect(tickPatch(player)).toEqual({
      vault: 12.5,
      stats: player.stats,
      lastTickAt: 999,
      milestones: { totalMined: 50, bestHashRate: 12.5 },
      version: 7,
    });
  });
});

describe("equipment mining cutover", () => {
  it("prices each side of the release boundary at its own rate", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(EQUIPMENT_STATS_EFFECTIVE_AT + 1000);
    try {
      const player = makePlayer({ wallet: "alice", vault: 0, vaultStaked: 1000,
        lastTickAt: EQUIPMENT_STATS_EFFECTIVE_AT - 1000, lastSinkAt: EQUIPMENT_STATS_EFFECTIVE_AT,
        statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
        equipment: { asicMiner: "gear" } as never });
      const gear = { id: "gear", slot: "asicMiner" as const, owner: "alice", equipped: true, salvaged: false, stats: { hashRate: 10 } };
      const result = tickPlayer(player, [gear]);
      expect(result.player.stats.hashRate).toBe(11);
      expect(result.mined).toBeCloseTo(miningPerSecond(1) + miningPerSecond(11), 6);
      expect(result.player.lastTickAt).toBe(EQUIPMENT_STATS_EFFECTIVE_AT + 1000);
    } finally { clock.mockRestore(); }
  });
});

describe("target estimates and persisted ticks", () => {
  it.each(["ordinary", "equipment", "decay", "full", "future", "cutover", "effects"])(
    "agrees at the same timestamp for %s without changing the read snapshot",
    (scenario) => {
      const at = EQUIPMENT_STATS_EFFECTIVE_AT + 3600_000;
      const clock = vi.spyOn(Date, "now").mockReturnValue(at);
      try {
        const player = makePlayer({ wallet: "alice", vault: 0, vaultStaked: 100,
          lastTickAt: at - 3600_000, lastSinkAt: at,
          statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 } });
        const gear = scenario === "equipment" || scenario === "cutover"
          ? [{ id: "gear", slot: "asicMiner" as const, owner: "alice", equipped: true, salvaged: false, stats: { hashRate: 10 } }] : [];
        if (gear.length) player.equipment = { asicMiner: "gear" } as never;
        if (scenario === "decay") player.lastSinkAt = at - 28 * 86400_000;
        if (scenario === "full") { player.vaultStaked = 0; player.vault = 1; }
        if (scenario === "future") player.lastTickAt = at + 1000;
        if (scenario === "cutover") player.lastTickAt = EQUIPMENT_STATS_EFFECTIVE_AT - 1000;
        if (scenario === "effects") player.statEffects = { hashRate: {
          stat: "hashRate", itemId: "sabotage-device", appliedBy: "private-player",
          appliedAt: at - 2000_000, active: true, strength: 0.5, critical: false,
          helps: [{ itemId: "help-kit", appliedBy: "private-helper", appliedAt: at - 1000_000, strength: 0.2, critical: false }],
        } };
        const before = structuredClone(player);
        const estimate = toRaidTarget(player as unknown as IPlayer, "viewer", at, resolvedPlayerStats(player, gear));
        expect(player).toEqual(before);
        const tick = tickPlayer(structuredClone(player), gear);
        expect(estimate.vault).toBe(tick.player.vault);
        expect(tick.player.milestones.totalMined).toBeCloseTo(estimate.vault - before.vault, 6);
      } finally { clock.mockRestore(); }
    },
  );
});
