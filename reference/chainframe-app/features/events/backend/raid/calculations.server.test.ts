import { beforeEach, describe, expect, it, vi } from "vitest";

const rngValues: number[] = [];
vi.mock("@/lib/utils/game/rng.server", () => ({
  createSeededRng: () => () => {
    const next = rngValues.shift();
    if (next === undefined) throw new Error("rng exhausted");
    return next;
  },
  generateServerSeed: () => "server-seed",
}));
vi.mock("@/lib/modules/logs/server.repository", () => ({ createLog: vi.fn() }));

import { simulateRaid } from "@/features/events/backend/raid/calculations.server";
import { vaultCapacity } from "@/features/types/game/mining";
import { exploitFromNotoriety } from "@/features/types/game/stats";
import type { IPlayer } from "@/lib/modules/players/server.types";

const makePlayer = (overrides: Record<string, unknown> = {}): IPlayer =>
  ({
    wallet: "0xA",
    vault: 0,
    vaultStaked: 1_000_000,
    notoriety: 0,
    protectionUntil: 0,
    statLevels: {
      hashRate: 0,
      hackPower: 0,
      security: 0,
      firewall: 0,
      luck: 0,
      exploit: 0,
    },
    stats: {
      hashRate: 0,
      hackPower: overrides.wallet === "0xD" ? 0 : 10,
      security: 0,
      firewall: 1,
      luck: 25,
      exploit: exploitFromNotoriety(0),
    },
    milestones: { raids: 0, raidWins: 0, totalStolen: 0 },
    xp: 0,
    ...overrides,
  }) as unknown as IPlayer;

// rng order: [success roll, base exposure roll, critical roll]
const WIN = 0.1;
const NO_CRIT = 0.99;
const CRIT = 0;

beforeEach(() => {
  rngValues.length = 0;
});

describe("simulateRaid", () => {
  it("blocks a protected defender without rolling", () => {
    const result = simulateRaid(
      makePlayer(),
      makePlayer({ wallet: "0xD", protectionUntil: Date.now() + 60_000 }),
      "s",
    );
    expect(result).toMatchObject({
      success: false,
      reason: "blocked",
      stolen: 0,
      notorietyGained: 0,
      destroyed: 0,
    });
  });

  it("fails without any transfer or Notoriety when the success roll misses", () => {
    rngValues.push(0.99, 0.5);
    const result = simulateRaid(
      makePlayer(),
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result).toMatchObject({
      success: false,
      reason: "failed",
      stolen: 0,
      takenFromVault: 0,
      notorietyGained: 0,
    });
  });

  it("risks floor(attacker vault x rolled base exposure) on a failed raid (D2)", () => {
    rngValues.push(0.99, 0.5); // base = 0.30
    const result = simulateRaid(
      makePlayer({ vault: 1_000 }),
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result).toMatchObject({
      success: false,
      reason: "failed",
      riskAmount: 300,
      defenderNotorietyGained: 300,
    });
    expect(result.stolen).toBe(0);
  });

  it("preserves fractional failed-raid risk and never exceeds the vault", () => {
    rngValues.push(0.99, 1); // base = 0.50
    const odd = simulateRaid(
      makePlayer({ vault: 7 }),
      makePlayer({ wallet: "0xD" }),
      "s",
    );
    expect(odd.riskAmount).toBe(3.5);
    expect(odd.defenderNotorietyGained).toBe(3.5);
    rngValues.push(0.99, 1);
    const empty = simulateRaid(
      makePlayer({ vault: 0 }),
      makePlayer({ wallet: "0xD" }),
      "s",
    );
    expect(empty.riskAmount).toBe(0);
    expect(empty.defenderNotorietyGained).toBe(0);
  });

  it("credits fractional loot, caps fractional free space and destroys only excess", () => {
    rngValues.push(WIN, 0.75, NO_CRIT); // exposure 40%
    const result = simulateRaid(
      makePlayer({ vault: 0.75, vaultStaked: 0 }),
      makePlayer({ wallet: "0xD", vault: 2 }),
      "fractional",
    );
    expect(result).toMatchObject({
      success: true,
      takenFromVault: 0.8,
      stolen: 0.25,
      destroyed: 0.55,
      notorietyGained: 0.25,
    });
  });

  it("never applies the failed-raid risk to a blocked raid", () => {
    const result = simulateRaid(
      makePlayer({ vault: 1_000 }),
      makePlayer({ wallet: "0xD", protectionUntil: Date.now() + 60_000 }),
      "s",
    );
    expect(result).toMatchObject({
      reason: "blocked",
      riskAmount: 0,
      defenderNotorietyGained: 0,
    });
  });

  it("uses the rolled base exposure on a normal raid", () => {
    rngValues.push(WIN, 0.5, NO_CRIT); // base = 0.10 + 0.5 * 0.40 = 0.30
    const result = simulateRaid(
      makePlayer(),
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result.critical).toBe(false);
    expect(result.exposure).toBeCloseTo(0.3, 10);
    expect(result.takenFromVault).toBe(3_000);
    expect(result.stolen).toBe(3_000);
    expect(result.destroyed).toBe(0);
  });

  it("doubles exposure on a critical raid", () => {
    rngValues.push(WIN, 0.5, CRIT);
    const result = simulateRaid(
      makePlayer(),
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result.critical).toBe(true);
    expect(result.exposure).toBeCloseTo(0.6, 10);
    expect(result.takenFromVault).toBe(6_000);
  });

  it("clamps a critical on the maximum base at 100% of the vault", () => {
    rngValues.push(WIN, 1, CRIT); // base 0.50, crit -> 1.00
    const result = simulateRaid(
      makePlayer(),
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result.exposure).toBe(1);
    expect(result.takenFromVault).toBe(10_000);
  });

  it("destroys the excess above the attacker's free space (10,000 vault, 50%, 1,500 space)", () => {
    rngValues.push(WIN, 1, NO_CRIT); // base 0.50
    const attacker = makePlayer({ vaultStaked: 0 });
    attacker.vault = vaultCapacity(0) - 1_500;
    const result = simulateRaid(
      attacker,
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result.takenFromVault).toBe(5_000);
    expect(result.stolen).toBe(1_500);
    expect(result.destroyed).toBe(3_500);
  });

  it("awards Notoriety equal to HASH received, not HASH taken", () => {
    rngValues.push(WIN, 1, NO_CRIT);
    const attacker = makePlayer({ vaultStaked: 0 });
    attacker.vault = vaultCapacity(0) - 1_500;
    const result = simulateRaid(
      attacker,
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result.notorietyGained).toBe(result.stolen);
    expect(result.notorietyGained).not.toBe(result.takenFromVault);
  });

  it("awards no Notoriety when nothing is received (full vault or empty defender)", () => {
    rngValues.push(WIN, 1, NO_CRIT);
    const fullAttacker = makePlayer({ vaultStaked: 0 });
    fullAttacker.vault = vaultCapacity(0);
    const full = simulateRaid(
      fullAttacker,
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(full).toMatchObject({
      success: true,
      stolen: 0,
      notorietyGained: 0,
      destroyed: 5_000,
    });

    rngValues.push(WIN, 1, NO_CRIT);
    const empty = simulateRaid(
      makePlayer(),
      makePlayer({ wallet: "0xD", vault: 0 }),
      "s",
    );
    expect(empty).toMatchObject({
      success: true,
      stolen: 0,
      notorietyGained: 0,
      takenFromVault: 0,
    });
  });

  it("makes gear Exploit raise the crit chance", () => {
    rngValues.push(WIN, 0.5, 0.99);
    const attacker = makePlayer({
      stats: { exploit: exploitFromNotoriety(0) + 99, hackPower: 10 },
    });
    const result = simulateRaid(
      attacker,
      makePlayer({ wallet: "0xD", vault: 10_000 }),
      "s",
    );
    expect(result.critical).toBe(true);
  });

  it("does not mutate either player", () => {
    rngValues.push(WIN, 0.5, NO_CRIT);
    const attacker = makePlayer();
    const defender = makePlayer({ wallet: "0xD", vault: 10_000 });
    const before = JSON.stringify([attacker, defender]);
    simulateRaid(attacker, defender, "s");
    expect(JSON.stringify([attacker, defender])).toBe(before);
  });
});
