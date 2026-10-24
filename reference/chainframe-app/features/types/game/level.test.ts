import { describe, it, expect } from "vitest";
import { levelFromXp, levelProgress, xpForLevel } from "./level";

describe("xpForLevel / levelFromXp", () => {
  it("level 1 starts at 0 XP", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
  });

  it.each([
    [1, 0],
    [2, 1000],
    [3, 4000],
    [5, 16000],
  ])("level %d requires %d cumulative XP", (level, xp) => {
    expect(xpForLevel(level)).toBe(xp);
  });

  it("levelFromXp is the inverse of xpForLevel at exact thresholds", () => {
    for (const level of [1, 2, 3, 5, 10]) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
    }
  });

  it("never returns a level below 1, even for negative XP", () => {
    expect(levelFromXp(-100)).toBe(1);
  });
});

describe("levelProgress", () => {
  it("reports 0% right at the start of a level", () => {
    const progress = levelProgress(xpForLevel(3));
    expect(progress.level).toBe(3);
    expect(progress.intoLevel).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it("reports 100% right before the next level's threshold crosses over", () => {
    const start = xpForLevel(2);
    const next = xpForLevel(3);
    const progress = levelProgress(next - 1);
    expect(progress.level).toBe(2);
    expect(progress.percent).toBeLessThan(100);
    expect(progress.intoLevel).toBe(next - 1 - start);
  });

  it("clamps negative/undefined-ish XP to zero", () => {
    const progress = levelProgress(-50);
    expect(progress.xp).toBe(0);
    expect(progress.level).toBe(1);
  });
});
