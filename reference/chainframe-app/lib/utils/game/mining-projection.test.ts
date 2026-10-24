import { describe, expect, it } from "vitest";
import { projectVault } from "./mining-projection";
import { miningPerSecond, decayMultiplier } from "@/features/types/game/mining";
const base = {
  vault: 0.1,
  vaultStaked: 0,
  lastTickAt: 1000,
  lastSinkAt: 1000,
  statLevels: { hashRate: 1 },
  statEffects: {},
};
describe("read-only mining projection", () => {
  it("projects growth without changing the authoritative snapshot", () => {
    const before = structuredClone(base);
    const expected = Number((base.vault + miningPerSecond(1) * 60).toFixed(6));
    expect(projectVault(base, 61000)).toBe(expected);
    expect(base).toEqual(before);
  });
  it("caps at capacity and never projects negative elapsed time", () => {
    expect(projectVault(base, 999)).toBe(base.vault);
    expect(projectVault(base, 1e12)).toBe(1);
  });
  it("uses public effect strength and current decay", () => {
    const now = 30 * 86400000;
    const snapshot = {
      ...base,
      lastTickAt: now - 60000,
      statEffects: {
        hashRate: {
          strength: 0.4,
          originalStrength: 0.4,
          critical: false,
          helped: false,
        },
      },
    };
    expect(projectVault(snapshot, now)).toBe(
      Number(
        (
          base.vault +
          miningPerSecond(0.6, decayMultiplier(base.lastSinkAt, now)) * 60
        ).toFixed(6),
      ),
    );
  });
  it("rebases after authoritative settlement instead of adding both intervals", () => {
    const first = projectVault(base, 61000);
    const refreshed = { ...base, vault: 0.01, lastTickAt: 61000 };
    expect(projectVault(refreshed, 61000)).toBe(0.01);
    expect(projectVault(refreshed, 121000)).toBe(
      Number((0.01 + miningPerSecond(1) * 60).toFixed(6)),
    );
    expect(projectVault(refreshed, 121000)).toBeLessThan(first);
  });
});
