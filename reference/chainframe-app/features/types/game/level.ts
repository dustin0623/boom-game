/**
 * Experience & leveling — ported from reference/mythoria
 * (features/game-store/formulas/xp.ts).
 *
 *   cumulative XP required to reach level N = (N - 1)^2 * 1000
 *   level(xp) = floor(sqrt(xp / 1000)) + 1
 *
 * `xp` on the player is the CUMULATIVE total XP ever earned.
 */

export const XP_PER_LEVEL_BASE = 1000;

/** XP awarded per HASH routed into a stat upgrade. */
export const XP_PER_HASH = 10;

/**
 * XP awarded per SPARK involved in a gear sink:
 *   - item upgrade  -> SPARK value gained (salvageValue after - before)
 *   - item salvage  -> SPARKS credited for burning the item
 * Chest purchases, vault staking, and HASH burns intentionally grant no XP.
 */
export const XP_PER_SPARK = 100;

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(xp, 0) / XP_PER_LEVEL_BASE)) + 1;
}

/** Cumulative XP needed to reach `level`. Level 1 starts at 0. */
export function xpForLevel(level: number): number {
  return Math.pow(Math.max(level, 1) - 1, 2) * XP_PER_LEVEL_BASE;
}

export interface LevelProgress {
  level: number;
  /** Cumulative XP earned. */
  xp: number;
  /** XP earned inside the current level. */
  intoLevel: number;
  /** XP span of the current level. */
  levelSpan: number;
  /** Cumulative XP required for the next level. */
  nextLevelXp: number;
  /** 0-100. */
  percent: number;
}

export function levelProgress(xp: number): LevelProgress {
  const total = Math.max(0, xp || 0);
  const level = levelFromXp(total);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const levelSpan = Math.max(1, next - start);
  const intoLevel = Math.max(0, total - start);
  return {
    level,
    xp: total,
    intoLevel,
    levelSpan,
    nextLevelXp: next,
    percent: Math.min(100, (intoLevel / levelSpan) * 100),
  };
}
