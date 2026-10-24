import { createSeededRng } from "@/lib/utils/game/rng.server";
import { socialActionSucceeds, socialActionSuccessChance } from "./stat-effects";
import { describe, expect, it } from "vitest";
import {
  applyHelp,
  canApplySabotage,
  canHelpCounter,
  hasActiveSabotageBy,
  effectiveStatValue,
  isStatEffectActive,
  isStatEffectTarget,
  netEffectStrength,
  rollStatEffectStrength,
  type StatEffects,
} from "./stat-effects";
import { STAT_EFFECT_TARGETS } from "@/features/types/game/consumables";

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const help = (stat: unknown, strength = 0.2) => ({
  stat,
  itemId: "help-kit" as const,
  appliedBy: "wallet-b",
  appliedAt: 2_000,
  strength,
  critical: false,
});

describe("stat targets", () => {
  it("is restricted to hashRate, hackPower, and security", () => {
    expect([...STAT_EFFECT_TARGETS]).toEqual([
      "hashRate",
      "hackPower",
      "security",
    ]);
    for (const stat of STAT_EFFECT_TARGETS)
      expect(isStatEffectTarget(stat)).toBe(true);
  });

  it("rejects other identifiers", () => {
    for (const bad of [
      "luck",
      "firewall",
      "exploit",
      "",
      "HASHRATE",
      null,
      undefined,
      3,
    ]) {
      expect(isStatEffectTarget(bad)).toBe(false);
    }
  });
});

describe("rollStatEffectStrength", () => {
  it("rolls 10% at the lowest roll and 50% at the highest without a critical", () => {
    expect(
      rollStatEffectStrength({ rng: sequence(0, 0.5) }),
    ).toEqual({ strength: 0.1, critical: false });
    expect(
      rollStatEffectStrength({ rng: sequence(1, 0.5) }),
    ).toEqual({ strength: 0.5, critical: false });
  });

  it("keeps social strength at 10–50% without criticals", () => {
    expect(
      rollStatEffectStrength({ rng: sequence(1, 0.5) }),
    ).toEqual({ strength: 0.5, critical: false });
    expect(
      rollStatEffectStrength({ rng: sequence(0, 0.5) }),
    ).toEqual({ strength: 0.1, critical: false });
  });

  it("never rolls a social critical", () => {
    expect(
      rollStatEffectStrength({ rng: sequence(0.5, 0) }).critical,
    ).toBe(false);
  });

  it("treats a non-finite roll as the minimum", () => {
    expect(
      rollStatEffectStrength({ rng: sequence(Number.NaN, 0.5) })
        .strength,
    ).toBe(0.1);
  });
});

describe("effective stat value", () => {
  it("reduces the base by the Sabotage share and keeps the base untouched", () => {
    const effects = fixtureEffects("hashRate", 0.3);
    expect(effectiveStatValue(100, effects.hashRate)).toBeCloseTo(70, 10);
  });

  it("returns the base with no effect and zero at a 100% critical", () => {
    expect(effectiveStatValue(50, undefined)).toBe(50);
    const full = fixtureEffects("security", 1);
    expect(effectiveStatValue(50, full.security)).toBe(0);
  });

  it("never returns a negative or non-finite value", () => {
    expect(effectiveStatValue(-5, undefined)).toBe(0);
    expect(effectiveStatValue(Number.NaN, undefined)).toBe(0);
  });
});

describe("hasActiveSabotageBy", () => {
  it("checks all stats and ignores other actors and inactive or fully countered effects", () => {
    const effects = fixtureEffects("security", 0.5);
    const actor = effects.security!.appliedBy;
    expect(hasActiveSabotageBy(effects, actor)).toBe(true);
    expect(hasActiveSabotageBy(effects, "someone-else")).toBe(false);
    expect(hasActiveSabotageBy(undefined, actor)).toBe(false);
    expect(hasActiveSabotageBy({}, actor)).toBe(false);
    const partial = applyHelp(effects, help("security", 0.2));
    if (!partial.ok) throw new Error("Help rejected");
    expect(hasActiveSabotageBy(partial.effects, actor)).toBe(true);
    const full = applyHelp(effects, help("security", 0.5));
    if (!full.ok) throw new Error("Help rejected");
    expect(hasActiveSabotageBy(full.effects, actor)).toBe(false);
    effects.security!.active = false;
    expect(hasActiveSabotageBy(effects, actor)).toBe(false);
  });
});

describe("applyHelp", () => {
  it("reduces the matching Sabotage by the Help strength", () => {
    const sabotaged = fixtureEffects("security", 0.4);
    const result = applyHelp(sabotaged, help("security", 0.15));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(netEffectStrength(result.effects.security)).toBeCloseTo(0.25, 10);
    expect(result.effects.security?.helps).toEqual([
      {
        itemId: "help-kit",
        appliedBy: "wallet-b",
        appliedAt: 2_000,
        strength: 0.15,
        critical: false,
      },
    ]);
    expect(effectiveStatValue(100, result.effects.security)).toBeCloseTo(
      75,
      10,
    );
  });

  it("fully counters a Sabotage when Help meets or exceeds it, and the stat can be sabotaged again", () => {
    const sabotaged = fixtureEffects("hackPower", 0.3);
    const result = applyHelp(sabotaged, help("hackPower", 0.5));
    if (!result.ok) throw new Error("rejected");
    expect(result.effects.hackPower?.active).toBe(false);
    expect(isStatEffectActive(result.effects.hackPower)).toBe(false);
    expect(effectiveStatValue(100, result.effects.hackPower)).toBe(100);
    expect(canApplySabotage(result.effects, "hackPower")).toBeNull();
  });

  it("accumulates several Help Kits against one Sabotage", () => {
    let effects = fixtureEffects("hashRate", 0.5);
    for (const strength of [0.2, 0.2]) {
      const result = applyHelp(effects, help("hashRate", strength));
      if (!result.ok) throw new Error("rejected");
      effects = result.effects;
    }
    expect(netEffectStrength(effects.hashRate)).toBeCloseTo(0.1, 10);
    expect(effects.hashRate?.helps).toHaveLength(2);
  });

  it("only counters the selected stat", () => {
    const sabotaged = fixtureEffects("security", 0.4);
    expect(canHelpCounter(sabotaged, "hackPower")).toBe("no-active-effect");
    expect(applyHelp(sabotaged, help("hackPower"))).toEqual({
      ok: false,
      reason: "no-active-effect",
    });
  });

  it("rejects invalid stats, Sabotage Devices, and out-of-range strengths", () => {
    const sabotaged = fixtureEffects("security", 0.4);
    expect(applyHelp(sabotaged, help("luck"))).toEqual({
      ok: false,
      reason: "invalid-stat",
    });
    expect(
      applyHelp(sabotaged, { ...help("security"), itemId: "sabotage-device" }),
    ).toEqual({ ok: false, reason: "invalid-item" });
    expect(applyHelp(sabotaged, help("security", 0))).toEqual({
      ok: false,
      reason: "invalid-strength",
    });
    expect(applyHelp(sabotaged, help("security", 1.5))).toEqual({
      ok: false,
      reason: "invalid-strength",
    });
  });

  it("rejects Help with no active Sabotage", () => {
    expect(canHelpCounter({}, "security")).toBe("no-active-effect");
  });
});

function fixtureEffects(
  stat: (typeof STAT_EFFECT_TARGETS)[number],
  strength: number,
): StatEffects {
  return {
    [stat]: {
      stat,
      itemId: "sabotage-device",
      appliedBy: "wallet-a",
      appliedAt: 1000,
      strength,
      critical: false,
      active: true,
      helps: [],
    },
  };
}

describe("Luck success roll", () => {
  it("preserves seeded outcomes and draw order when relocating the base", () => {
    for (const luck of [0, 0.025, 2.025, 74.999, 75, 100]) {
      for (let index = 0; index < 40; index++) {
        const oldRng = createSeededRng(`social-base-${index}`);
        const newRng = createSeededRng(`social-base-${index}`);
        const oldSuccess = oldRng() < Math.min(100, 25 + luck) / 100;
        expect(socialActionSucceeds(luck, newRng)).toBe(oldSuccess);
        if (oldSuccess) expect(rollStatEffectStrength({ rng: newRng })).toEqual(rollStatEffectStrength({ rng: oldRng }));
        expect(newRng()).toBe(oldRng());
      }
    }
  });
  it("keeps the base chance exclusive to social actions and caps the total", () => {
    expect(socialActionSuccessChance(0)).toBe(25);
    expect(socialActionSuccessChance(0.025)).toBe(25.025);
    expect(socialActionSuccessChance(2.025)).toBe(27.025);
    expect(socialActionSuccessChance(75)).toBe(100);
    expect(socialActionSuccessChance(1000)).toBe(100);
    expect(socialActionSuccessChance(-100)).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite Luck %s before drawing", (luck) => {
    let draws = 0;
    expect(() => socialActionSuccessChance(luck)).toThrow("Invalid Luck");
    expect(() => socialActionSucceeds(luck, () => { draws++; return 0; })).toThrow("Invalid Luck");
    expect(draws).toBe(0);
  });
  it("supports fractional percentage odds and exact boundaries", () => {
    expect(socialActionSucceeds(0, () => 0.249999)).toBe(true);
    expect(socialActionSucceeds(0, () => 0.25)).toBe(false);
    expect(socialActionSucceeds(0.025, () => 0.2501)).toBe(true);
    expect(socialActionSucceeds(0, () => 0)).toBe(true);
    expect(socialActionSucceeds(100, () => 0.999999)).toBe(true);
    expect(socialActionSucceeds(1000, () => 0.999999)).toBe(true);
  });
});
