import { resolvedPlayerStats, equippedIds } from "./stats";
import { describe, it, expect } from "vitest";
import {
  gearExploitOf,
  derivedBaseStats,
  emptyStatBlock,
  exploitFromNotoriety,
  firewallFromVault,
  luckFromVault,
  maxAffordableUpgrades,
  pctFromTable,
  statValueFromLevel,
  sumStatRolls,
  totalStats,
  totalUpgradeCost,
  upgradeCost,
} from "./stats";

describe("upgradeCost", () => {
  it("is level squared, minimum 1", () => {
    expect(upgradeCost(1)).toBe(1);
    expect(upgradeCost(5)).toBe(25);
  });

  it("never goes below 1 even for level 0", () => {
    expect(upgradeCost(0)).toBe(1);
  });
});

describe("totalUpgradeCost", () => {
  it.each([
    [1, 1, 1],
    [2, 1, 4],
    [1, 2, 5],
    [1, 3, 14],
    [5, 2, 61],
  ])("charges level %i plus %i upgrades at %i HASH", (level, count, cost) => {
    expect(totalUpgradeCost(level, count)).toBe(cost);
  });

  it("is zero for zero upgrades", () => {
    expect(totalUpgradeCost(5, 0)).toBe(0);
  });
});

describe("maxAffordableUpgrades", () => {
  it("returns the number of whole upgrades a wallet can afford", () => {
    expect(maxAffordableUpgrades(1, 0)).toBe(0);
    expect(maxAffordableUpgrades(1, 0.9999)).toBe(0);
    expect(maxAffordableUpgrades(1, 1)).toBe(1);
    expect(maxAffordableUpgrades(1, 4.9999)).toBe(1);
    expect(maxAffordableUpgrades(1, 5)).toBe(2);
    expect(maxAffordableUpgrades(5, 61)).toBe(2);
    expect(maxAffordableUpgrades(1, Number.POSITIVE_INFINITY)).toBe(10_000);
  });
});

describe("statValueFromLevel", () => {
  it("scales combat stats x10", () => {
    expect(statValueFromLevel("hackPower", 3)).toBe(30);
    expect(statValueFromLevel("security", 3)).toBe(30);
  });

  it("leaves non-combat stats unscaled", () => {
    expect(statValueFromLevel("hashRate", 3)).toBe(3);
  });
});

describe("sumStatRolls / totalStats", () => {
  it("sums multiple rolls per key, treating missing keys as zero", () => {
    const sum = sumStatRolls([{ hashRate: 1 }, { hashRate: 2, luck: 5 }]);
    expect(sum.hashRate).toBe(3);
    expect(sum.luck).toBe(5);
  });

  it("adds gear stats on top of base stats", () => {
    const base = { ...emptyStatBlock(), hashRate: 10 };
    const equipped = [{ stats: { hashRate: 5 } }] as never;
    const total = totalStats(base, equipped);
    expect(total.hashRate).toBe(15);
  });
});

describe("pctFromTable / luckFromVault / firewallFromVault / exploitFromNotoriety", () => {
  it("returns zero below the first threshold", () => {
    expect(pctFromTable([[10, 1]], 5)).toBe(0);
  });

  it("locks in the highest threshold the value has crossed", () => {
    expect(
      pctFromTable(
        [
          [1, 0.1],
          [10, 1],
          [100, 5],
        ],
        50,
      ),
    ).toBe(1);
  });

  it("luck/firewall/exploit are zero-clamped and firewall/exploit carry a +1 floor", () => {
    expect(luckFromVault(-10)).toBe(0);
    expect(firewallFromVault(0)).toBe(1);
    expect(exploitFromNotoriety(0)).toBe(1);
  });
});

describe("derivedBaseStats", () => {
  it("combines upgraded levels with vault/notoriety-derived stats", () => {
    const statLevels = {
      hashRate: 5,
      hackPower: 2,
      security: 2,
      luck: 0,
      firewall: 0,
      exploit: 0,
    };
    const derived = derivedBaseStats(statLevels, 0, 0);
    expect(derived.hashRate).toBe(5);
    expect(derived.hackPower).toBe(20);
    expect(derived.luck).toBe(0);
    expect(derived.firewall).toBe(1);
    expect(derived.exploit).toBe(1);
  });
});

describe("gearExploitOf", () => {
  it("treats missing and null stat values as no gear contribution", () => {
    expect(gearExploitOf({})).toBe(0);
    expect(gearExploitOf({ stats: null, notoriety: null })).toBe(0);
    expect(gearExploitOf({ stats: {} })).toBe(0);
  });
  it("is the effective Exploit above the Notoriety-derived value", () => {
    expect(
      gearExploitOf({ stats: { exploit: exploitFromNotoriety(0) + 12 } }),
    ).toBe(12);
  });

  it("never goes negative when stats are stale", () => {
    expect(gearExploitOf({ notoriety: 5_000_000, stats: { exploit: 1 } })).toBe(
      0,
    );
  });
});

describe("authoritative equipped totals", () => {
  const player = {
    wallet: "alice", vaultStaked: 1, notoriety: 0,
    statLevels: { hashRate: 2, hackPower: 1, security: 2, luck: 99, firewall: 99, exploit: 99 },
    equipment: { asicMiner: "gear" },
  };
  const gear = { id: "gear", owner: "alice", slot: "asicMiner" as const, equipped: true, salvaged: false,
    stats: { hashRate: 5, hackPower: 3.5, security: 1, luck: 2, firewall: 4, exploit: 6 } };
  it("adds all six bonuses once and retains combat scaling without adding a social base to Luck", () => {
    expect(equippedIds(player)).toEqual(["gear"]);
    expect(resolvedPlayerStats(player, [gear])).toEqual({
      hashRate: 7, hackPower: 13.5, security: 21, luck: 2.025, firewall: 5.025, exploit: 7,
    });
    expect(resolvedPlayerStats({ ...player, equipment: {} }, [gear]).luck).toBe(0.025);
    expect(resolvedPlayerStats(player, [{ ...gear, stats: { luck: 500 } }]).luck).toBe(100);
  });
  it.each([
    [], [{ ...gear, owner: "bob" }], [{ ...gear, equipped: false }],
    [{ ...gear, salvaged: true }], [{ ...gear, purchaseReserved: true }],
    [{ ...gear, market: { isMarket: true } }], [{ ...gear, slot: "networkModule" as const }],
    [{ ...gear, stats: { hashRate: Number.NaN } }],
  ])("rejects missing or inconsistent equipment evidence", (...records) => {
    expect(() => resolvedPlayerStats(player, records)).toThrow();
  });
  it("rejects one item referenced by two slots", () => {
    expect(() => resolvedPlayerStats({ ...player, equipment: { asicMiner: "gear", motherboard: "gear" } }, [gear])).toThrow();
  });
});
