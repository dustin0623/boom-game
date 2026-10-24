import { STAT_KEYS } from "@/lib/config/constants/game";
import type { Equipment, StatKey, StatRoll } from "@/features/types/game/types";

/**
 * Salvage weights ported from TerraCore / Mythoria `dismantleValue`:
 *   damage/2 + defense/2 + engineering*5 + dodge*5 + crit*5 + luck*10
 * Combat-scale stats (hackPower/security) are stored x10 here, exactly like
 * damage/defense in the reference game, hence the 0.5 weight.
 */
export const SALVAGE_MULTIPLIERS: Record<StatKey, number> = {
  hackPower: 0.5,
  security: 0.5,
  hashRate: 5,
  firewall: 5,
  exploit: 5,
  luck: 10,
};

/** SPARKS returned for burning an item (reference: `dismantleValue`). */
export const salvageValue = (
  item: Pick<Equipment, "stats" | "level">,
): number =>
  STAT_KEYS.reduce(
    (total, key) => total + (item.stats[key] ?? 0) * SALVAGE_MULTIPLIERS[key],
    0,
  );

/** Reference forge rate: value * 0.0498 * level. */
export const UPGRADE_RATE = 0.0498;

/**
 * SPARKS required to push an item to its next level. Named `itemUpgradeCost`
 * to distinguish it from the permanent-stat `upgradeCost` in `stats.ts`.
 * Consumers import both calculations directly from their owning files.
 */
export const itemUpgradeCost = (
  item: Pick<Equipment, "stats" | "level">,
): number => salvageValue(item) * UPGRADE_RATE * item.level;

/** Every upgrade multiplies each rolled stat by 1.05 (reference: forge). */
export const UPGRADE_MULTIPLIER = 1.05;

export const upgradedStats = (stats: StatRoll): StatRoll => {
  const next: StatRoll = {};
  for (const key of STAT_KEYS) {
    const value = stats[key];
    if (value === undefined) continue;
    next[key] = Math.round(value * UPGRADE_MULTIPLIER * 10000) / 10000;
  }
  return next;
};
