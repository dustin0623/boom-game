import { describe, it, expect } from "vitest";
import {
  CHARGE_REGEN_MS,
  MAX_CLAIM_CHARGES,
  MAX_RAID_CHARGES,
  RAID_CHARGE_DECAY_DAYS,
} from "@/lib/config/constants/game";
import {
  claimCharges,
  effectiveMaxRaidCharges,
  raidCharges,
  regenCharges,
} from "./charges";

describe("regenCharges", () => {
  const cases: Array<{
    name: string;
    charges: number;
    elapsedMs: number;
    max: number;
    expectedCurrent: number;
  }> = [
    {
      name: "no time elapsed",
      charges: 2,
      elapsedMs: 0,
      max: 5,
      expectedCurrent: 2,
    },
    {
      name: "one interval elapsed gains one charge",
      charges: 2,
      elapsedMs: CHARGE_REGEN_MS,
      max: 5,
      expectedCurrent: 3,
    },
    {
      name: "partial interval gains nothing",
      charges: 2,
      elapsedMs: CHARGE_REGEN_MS - 1,
      max: 5,
      expectedCurrent: 2,
    },
    {
      name: "gains cap at max",
      charges: 4,
      elapsedMs: CHARGE_REGEN_MS * 10,
      max: 5,
      expectedCurrent: 5,
    },
  ];

  it.each(cases)("$name", ({ charges, elapsedMs, max, expectedCurrent }) => {
    const now = 1_000_000;
    const snapshot = regenCharges(
      { charges, lastRegenAt: now - elapsedMs },
      max,
      now,
    );
    expect(snapshot.current).toBe(expectedCurrent);
    expect(snapshot.max).toBe(max);
  });

  it("reports no countdown once at max", () => {
    const now = 1_000_000;
    const snapshot = regenCharges({ charges: 5, lastRegenAt: now }, 5, now);
    expect(snapshot.msUntilNext).toBeNull();
  });

  it("anchors the regen clock to now once charges hit max, avoiding an instant refund", () => {
    const now = 1_000_000;
    const snapshot = regenCharges(
      { charges: 4, lastRegenAt: now - CHARGE_REGEN_MS },
      5,
      now,
    );
    expect(snapshot.current).toBe(5);
    expect(snapshot.lastRegenAt).toBe(now);
  });

  it("reports a countdown proportional to elapsed time when below max", () => {
    const now = 1_000_000;
    const halfway = CHARGE_REGEN_MS / 2;
    const snapshot = regenCharges(
      { charges: 0, lastRegenAt: now - halfway },
      5,
      now,
    );
    expect(snapshot.msUntilNext).toBe(CHARGE_REGEN_MS - halfway);
  });
});

describe("effectiveMaxRaidCharges", () => {
  it("returns the full cap with no prior sink", () => {
    expect(effectiveMaxRaidCharges(null)).toBe(MAX_RAID_CHARGES);
    expect(effectiveMaxRaidCharges(undefined)).toBe(MAX_RAID_CHARGES);
  });

  it("stays at the full cap inside the decay window", () => {
    const now = 1_000_000_000;
    const lastSinkAt = now - (RAID_CHARGE_DECAY_DAYS - 1) * 86_400_000;
    expect(effectiveMaxRaidCharges(lastSinkAt, now)).toBe(MAX_RAID_CHARGES);
  });

  it("decays by one charge per decay window, never below one", () => {
    const now = 1_000_000_000;
    const manyWindowsAgo = now - RAID_CHARGE_DECAY_DAYS * 86_400_000 * 1000;
    expect(effectiveMaxRaidCharges(manyWindowsAgo, now)).toBe(1);
  });
});

describe("claimCharges / raidCharges", () => {
  it("claimCharges regenerates against MAX_CLAIM_CHARGES", () => {
    const now = 1_000_000;
    const snapshot = claimCharges({ charges: 0, lastRegenAt: now }, now);
    expect(snapshot.max).toBe(MAX_CLAIM_CHARGES);
  });

  it("raidCharges regenerates against the decayed raid cap", () => {
    const now = 1_000_000_000;
    const manyWindowsAgo = now - RAID_CHARGE_DECAY_DAYS * 86_400_000 * 1000;
    const snapshot = raidCharges(
      { charges: 0, lastRegenAt: now },
      manyWindowsAgo,
      now,
    );
    expect(snapshot.max).toBe(1);
  });
});
