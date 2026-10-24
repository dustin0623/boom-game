import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/lib/utils/game/rng.server";
import { EXPLOIT_TABLE, exploitFromNotoriety } from "./stats";
import {
  critChanceFromExploit,
  resolveExposure,
  resolveTransfer,
  rollBaseExposure,
  totalExploit,
} from "./exposure";

const fixedRng = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

describe("rollBaseExposure", () => {
  it("maps the rng range onto [0.10, 0.50]", () => {
    expect(rollBaseExposure(() => 0)).toBeCloseTo(0.1, 10);
    expect(rollBaseExposure(() => 0.5)).toBeCloseTo(0.3, 10);
    expect(rollBaseExposure(() => 0.999999)).toBeLessThanOrEqual(0.5);
    expect(rollBaseExposure(() => 0.999999)).toBeCloseTo(0.5, 5);
  });

  it("never leaves the bounds across many seeded rolls", () => {
    const rng = createSeededRng("exposure-bounds");
    for (let i = 0; i < 2000; i++) {
      const value = rollBaseExposure(rng);
      expect(value).toBeGreaterThanOrEqual(0.1);
      expect(value).toBeLessThanOrEqual(0.5);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = rollBaseExposure(createSeededRng("same"));
    const b = rollBaseExposure(createSeededRng("same"));
    expect(a).toBe(b);
  });

  it("falls back to the minimum when the rng misbehaves", () => {
    expect(rollBaseExposure(() => Number.NaN)).toBeCloseTo(0.1, 10);
    expect(rollBaseExposure(() => 5)).toBeCloseTo(0.5, 10);
    expect(rollBaseExposure(() => -5)).toBeCloseTo(0.1, 10);
  });
});

describe("critChanceFromExploit", () => {
  it("is exploit / 100, clamped to [0, 1]", () => {
    expect(critChanceFromExploit(0)).toBe(0);
    expect(critChanceFromExploit(25)).toBe(0.25);
    expect(critChanceFromExploit(100)).toBe(1);
    expect(critChanceFromExploit(250)).toBe(1);
    expect(critChanceFromExploit(-10)).toBe(0);
    expect(critChanceFromExploit(Number.NaN)).toBe(0);
  });
});

describe("totalExploit", () => {
  it("adds gear to the Notoriety-derived Exploit", () => {
    expect(totalExploit(0)).toBe(exploitFromNotoriety(0));
    expect(totalExploit(500, 12)).toBe(exploitFromNotoriety(500) + 12);
  });

  it("ignores negative or invalid gear", () => {
    expect(totalExploit(500, -5)).toBe(exploitFromNotoriety(500));
    expect(totalExploit(500, Number.NaN)).toBe(exploitFromNotoriety(500));
  });
});

describe("resolveExposure", () => {
  it("normal roll keeps the base exposure", () => {
    const result = resolveExposure({
      baseExposure: 0.3,
      exploit: 50,
      rng: () => 0.99,
    });
    expect(result).toEqual({ exposure: 0.3, critical: false });
  });

  it("critical roll doubles the base exposure", () => {
    const result = resolveExposure({
      baseExposure: 0.3,
      exploit: 50,
      rng: () => 0.1,
    });
    expect(result.critical).toBe(true);
    expect(result.exposure).toBeCloseTo(0.6, 10);
  });

  it("critical at base 0.50 reaches exactly 1.00", () => {
    const result = resolveExposure({
      baseExposure: 0.5,
      exploit: 100,
      rng: () => 0,
    });
    expect(result).toEqual({ exposure: 1, critical: true });
  });

  it("critical at base 0.60 clamps to 1.00 instead of 1.20", () => {
    const result = resolveExposure({
      baseExposure: 0.6,
      exploit: 100,
      rng: () => 0,
    });
    expect(result).toEqual({ exposure: 1, critical: true });
  });

  it("exploit 0 never crits, even on the lowest roll", () => {
    for (const roll of [0, 0.0001, 0.5, 0.9999]) {
      const result = resolveExposure({
        baseExposure: 0.4,
        exploit: 0,
        rng: () => roll,
      });
      expect(result).toEqual({ exposure: 0.4, critical: false });
    }
  });

  it("exploit 100 always crits", () => {
    for (const roll of [0, 0.5, 0.9999]) {
      expect(
        resolveExposure({ baseExposure: 0.2, exploit: 100, rng: () => roll })
          .critical,
      ).toBe(true);
    }
  });

  it("crit frequency tracks the crit chance", () => {
    const rng = createSeededRng("crit-frequency");
    let crits = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (resolveExposure({ baseExposure: 0.2, exploit: 30, rng }).critical)
        crits++;
    }
    expect(crits / trials).toBeGreaterThan(0.26);
    expect(crits / trials).toBeLessThan(0.34);
  });

  it("consumes exactly one rng value", () => {
    const next = fixedRng(0.1, 0.9);
    resolveExposure({ baseExposure: 0.2, exploit: 50, rng: next });
    expect(next()).toBe(0.9);
  });

  it("clamps an out-of-range base exposure", () => {
    expect(
      resolveExposure({ baseExposure: 2, exploit: 0, rng: () => 0.5 }).exposure,
    ).toBe(1);
    expect(
      resolveExposure({ baseExposure: -1, exploit: 0, rng: () => 0.5 })
        .exposure,
    ).toBe(0);
  });
});

describe("resolveTransfer", () => {
  it("matches the Update Plan example: 10,000 vault, 50%, capacity 1,500", () => {
    const result = resolveTransfer({
      defenderVault: 10_000,
      exposure: 0.5,
      attackerFreeSpace: 1_500,
    });
    expect(result).toEqual({
      takenFromVault: 5_000,
      received: 1_500,
      destroyed: 3_500,
    });
  });

  it("transfers everything taken when the attacker has room", () => {
    const result = resolveTransfer({
      defenderVault: 10_000,
      exposure: 0.2,
      attackerFreeSpace: 50_000,
    });
    expect(result).toEqual({
      takenFromVault: 2_000,
      received: 2_000,
      destroyed: 0,
    });
  });

  it("received never exceeds free space", () => {
    for (const freeSpace of [0, 1, 99, 1_000, 5_000, 100_000]) {
      const result = resolveTransfer({
        defenderVault: 8_765,
        exposure: 0.37,
        attackerFreeSpace: freeSpace,
      });
      expect(result.received).toBeLessThanOrEqual(freeSpace);
      expect(result.received + result.destroyed).toBe(result.takenFromVault);
    }
  });

  it("destroys everything when the attacker has no free space", () => {
    const result = resolveTransfer({
      defenderVault: 1_000,
      exposure: 0.4,
      attackerFreeSpace: 0,
    });
    expect(result).toEqual({
      takenFromVault: 400,
      received: 0,
      destroyed: 400,
    });
  });

  it("keeps fractional loot and absorbs float error", () => {
    expect(
      resolveTransfer({
        defenderVault: 999,
        exposure: 0.1,
        attackerFreeSpace: 10_000,
      }).takenFromVault,
    ).toBe(99.9);
    expect(
      resolveTransfer({
        defenderVault: 100,
        exposure: 0.29,
        attackerFreeSpace: 10_000,
      }).takenFromVault,
    ).toBe(29);
  });

  it.each([
    [2, 0.4, 1, 0.8, 0.8, 0],
    [0.9, 0.5, 1, 0.45, 0.45, 0],
    [2, 0.4, 0.25, 0.8, 0.25, 0.55],
    [0.123456, 1, 1, 0.123456, 0.123456, 0],
    [0.000001, 0.5, 1, 0, 0, 0],
    [0.000003, 0.5, 1, 0.000001, 0.000001, 0],
    [1, 0.5, 0.0000009, 0.5, 0, 0.5],
    [1, 0.5, 0.3 - 0.2, 0.5, 0.1, 0.4],
  ])(
    "settles fractional vault %s at exposure %s with capacity %s",
    (
      defenderVault,
      exposure,
      attackerFreeSpace,
      takenFromVault,
      received,
      destroyed,
    ) => {
      expect(
        resolveTransfer({ defenderVault, exposure, attackerFreeSpace }),
      ).toEqual({ takenFromVault, received, destroyed });
    },
  );

  it("a 100% critical drains the defender entirely but never below zero", () => {
    const result = resolveTransfer({
      defenderVault: 1_234,
      exposure: 1,
      attackerFreeSpace: 10_000,
    });
    expect(result).toEqual({
      takenFromVault: 1_234,
      received: 1_234,
      destroyed: 0,
    });
  });

  it("handles empty vaults and invalid input without going negative", () => {
    expect(
      resolveTransfer({
        defenderVault: 0,
        exposure: 0.5,
        attackerFreeSpace: 100,
      }),
    ).toEqual({
      takenFromVault: 0,
      received: 0,
      destroyed: 0,
    });
    expect(
      resolveTransfer({
        defenderVault: -50,
        exposure: 0.5,
        attackerFreeSpace: -10,
      }),
    ).toEqual({
      takenFromVault: 0,
      received: 0,
      destroyed: 0,
    });
    expect(
      resolveTransfer({
        defenderVault: 1_000,
        exposure: 3,
        attackerFreeSpace: 5_000,
      }).takenFromVault,
    ).toBe(1_000);
    expect(
      resolveTransfer({
        defenderVault: 1_000,
        exposure: Number.NaN,
        attackerFreeSpace: 5_000,
      }).takenFromVault,
    ).toBe(0);
  });
});

describe("Exploit source is unchanged", () => {
  it("keeps EXPLOIT_TABLE values", () => {
    expect(EXPLOIT_TABLE).toHaveLength(21);
    expect(EXPLOIT_TABLE[0]).toEqual([1, 0.025]);
    expect(EXPLOIT_TABLE[6]).toEqual([100, 2.5]);
    expect(EXPLOIT_TABLE[EXPLOIT_TABLE.length - 1]).toEqual([
      5_000_000, 14.027,
    ]);
  });

  it("keeps exploitFromNotoriety behavior", () => {
    expect(exploitFromNotoriety(0)).toBe(1);
    expect(exploitFromNotoriety(100)).toBe(3.5);
    expect(exploitFromNotoriety(5_000_000)).toBeCloseTo(15.027, 10);
    expect(exploitFromNotoriety(-20)).toBe(1);
  });

  it("derives crit chance from the existing Exploit table", () => {
    expect(critChanceFromExploit(totalExploit(100))).toBeCloseTo(0.035, 10);
    expect(critChanceFromExploit(totalExploit(100, 20))).toBeCloseTo(0.235, 10);
  });
});
