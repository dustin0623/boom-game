import { describe, it, expect } from "vitest";
import {
  DECAY_FLOOR,
  DECAY_GRACE_DAYS,
  HASHRATE_SOFTCAP,
  HASHRATE_SOFTCAP_RATE,
  EQUIPMENT_STATS_EFFECTIVE_AT,
} from "@/lib/config/constants/game";
import {
  decayMultiplier,
  effectiveHashRate,
  secondsUntilFull,
  vaultCapacity,
  vaultFillPercent,
  currentMiningPerSecond,
  miningPerSecond,
  vaultAtTime,
} from "./mining";
import type { StatEffect } from "./stat-effects";

describe("vault accounting at a captured time", () => {
  const start = EQUIPMENT_STATS_EFFECTIVE_AT + 1000;
  const player = {
    vault: 0,
    vaultStaked: 10,
    lastTickAt: start,
    lastSinkAt: start,
    statLevels: { hashRate: 1 },
    stats: { hashRate: 1 },
  };

  it("includes offline mining without mutating the snapshot and stops at capacity", () => {
    const before = structuredClone(player);
    expect(vaultAtTime(player, start + 6 * 3600_000)).toBe(0.5);
    expect(vaultAtTime({ ...player, vaultStaked: 0 }, start + 86400_000)).toBe(1);
    expect(player).toEqual(before);
    expect(vaultAtTime({ ...player, vault: 0.163249 }, start - 1000)).toBe(0.163249);
  });

  it("uses resolved equipment stats, softcap and end-time decay", () => {
    const at = start + 28 * 86400_000;
    expect(vaultAtTime({ ...player, stats: { hashRate: 400 } }, start + 1000)).toBe(
      Number(miningPerSecond(400).toFixed(6)),
    );
    expect(vaultAtTime({ ...player, lastTickAt: at - 3600_000 }, at)).toBe(0.0675);
  });

  it("splits equipment cutover and historical Sabotage/Help intervals", () => {
    const cutover = EQUIPMENT_STATS_EFFECTIVE_AT;
    const effect: StatEffect = {
      stat: "hashRate", itemId: "sabotage-device", appliedBy: "private-attacker",
      appliedAt: cutover + 1000, active: false, strength: 0.5, critical: false,
      helps: [{ itemId: "help-kit", appliedBy: "private-helper", appliedAt: cutover + 2000, strength: 0.5, critical: false }],
    };
    const snapshot = { ...player, lastTickAt: cutover - 1000, stats: { hashRate: 11 }, statEffects: { hashRate: effect } };
    const before = structuredClone(snapshot);
    // One level-only second, one gear second before sabotage, one sabotaged second,
    // then a fully restored second. A fully countered effect still has past mining history.
    const expected = miningPerSecond(1) + 2 * miningPerSecond(11) + miningPerSecond(5.5);
    expect(vaultAtTime(snapshot, cutover + 3000)).toBe(Number(expected.toFixed(6)));
    expect(snapshot).toEqual(before);
  });
});

describe("current potential mining", () => {
  it("sums individual nonlinear rates and ignores vault fullness", () => {
    const at = Date.parse("2026-10-14T12:00:00Z");
    const players = [1, 400].map((hashRate) => ({
      statLevels: { hashRate },
      lastSinkAt: at,
      vault: 100,
      vaultStaked: 0,
    }));
    const total = players.reduce(
      (sum, player) => sum + currentMiningPerSecond(player, at),
      0,
    );
    expect(total).toBe(miningPerSecond(1) + miningPerSecond(400));
    expect(total).not.toBe(miningPerSecond(401));
    expect(players[0].vault).toBe(100);
  });
  it("uses decay and only effects and Help already active at the captured time", () => {
    const at = 10000000000;
    const effect: StatEffect = {
      stat: "hashRate",
      itemId: "sabotage-device",
      appliedBy: "bob",
      appliedAt: at - 1000,
      active: true,
      strength: 0.4,
      critical: false,
      helps: [
        {
          itemId: "help-kit",
          appliedBy: "carol",
          appliedAt: at - 100,
          strength: 0.1,
          critical: false,
        },
        {
          itemId: "help-kit",
          appliedBy: "dave",
          appliedAt: at + 100,
          strength: 0.1,
          critical: false,
        },
      ],
    };
    const player = {
      statLevels: { hashRate: 10 },
      lastSinkAt: 1,
      statEffects: { hashRate: effect },
    };
    expect(currentMiningPerSecond(player, at)).toBeCloseTo(
      miningPerSecond(7, decayMultiplier(1, at)),
      12,
    );
    effect.active = false;
    expect(currentMiningPerSecond(player, at)).toBe(
      miningPerSecond(10, decayMultiplier(1, at)),
    );
  });
});

describe("effectiveHashRate", () => {
  it("passes through unchanged below the softcap", () => {
    expect(effectiveHashRate(100)).toBe(100);
    expect(effectiveHashRate(HASHRATE_SOFTCAP)).toBe(HASHRATE_SOFTCAP);
  });

  it("applies the reduced rate above the softcap", () => {
    const over = HASHRATE_SOFTCAP + 100;
    expect(effectiveHashRate(over)).toBeCloseTo(
      HASHRATE_SOFTCAP + 100 * HASHRATE_SOFTCAP_RATE,
      5,
    );
  });

  it("floors negative input at zero", () => {
    expect(effectiveHashRate(-50)).toBe(0);
  });
});

describe("vaultCapacity", () => {
  it("grows with staked HASH", () => {
    expect(vaultCapacity(0)).toBe(1);
    expect(vaultCapacity(500)).toBe(501);
  });

  it("never dips below the base capacity for negative stake", () => {
    expect(vaultCapacity(-10)).toBe(1);
  });
});

describe("decayMultiplier", () => {
  it("is 1 with no prior sink", () => {
    expect(decayMultiplier(null)).toBe(1);
  });

  it("stays at 1 within the grace period", () => {
    const now = 1_000_000_000;
    const lastSinkAt = now - (DECAY_GRACE_DAYS - 1) * 86_400_000;
    expect(decayMultiplier(lastSinkAt, now)).toBe(1);
  });

  it("decays after the grace period and floors out", () => {
    const now = 1_000_000_000;
    const longAgo = now - (DECAY_GRACE_DAYS + 365) * 86_400_000;
    expect(decayMultiplier(longAgo, now)).toBe(DECAY_FLOOR);
  });
});

describe("vaultFillPercent / isVaultFull", () => {
  it("computes a clamped percentage", () => {
    expect(vaultFillPercent(50, 100)).toBe(50);
    expect(vaultFillPercent(150, 100)).toBe(100);
    expect(vaultFillPercent(10, 0)).toBe(0);
  });
});

describe("secondsUntilFull", () => {
  it("returns null when the mining rate is zero", () => {
    // The base formula always yields a positive rate from hash rate alone, so
    // the only way to reach a zero rate is a fully decayed (zero) multiplier.
    expect(secondsUntilFull(0, 0, 0, 0)).toBeNull();
  });

  it("returns 0 once already at or above capacity", () => {
    const capacity = vaultCapacity(0, 10);
    expect(secondsUntilFull(capacity, 10, 0)).toBe(0);
  });
});
