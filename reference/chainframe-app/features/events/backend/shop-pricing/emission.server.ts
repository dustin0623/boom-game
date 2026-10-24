import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import {
  gameActionNow,
  gameActionSeed,
} from "@/lib/utils/game/execution-context.server";

import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";

import {
  utcDayNumber,
  emissionDayKey,
  emissionKeyForTime,
  HIGH_WATER_KEY,
  LAST_RATCHET_KEY,
} from "@/lib/utils/game/pricing";
/** Adds claimed HASH to today's emission. Awaited by callers: a missed write would underprice. */
export async function recordEmission(
  amount: number,
  now = gameActionNow(),
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await gameStatsRepository.increment(emissionKeyForTime(now), amount);
}

export interface PricingEmission {
  /** HASH claimed by all players during the previous UTC day. */
  yesterday: number;
  /** Highest completed-day emission seen so far. Drives every price, so prices never fall. */
  highWater: number;
  /** UTC day number this snapshot is valid for. */
  day: number;
}

let cached: PricingEmission | null = null;

/** Test helper: forget the in-memory snapshot. */
export function resetPricingEmissionCache(): void {
  cached = null;
}

/**
 * Today's pricing emission. Lazily folds every completed day since the last
 * ratchet into a monotonic high-water mark (`$max`, atomic and idempotent), so a
 * peak is kept even when nobody opened the Shop that day. The snapshot cannot
 * change before the next UTC midnight, so it is cached until then.
 */
export async function getPricingEmission(
  now = gameActionNow(),
): Promise<PricingEmission> {
  const today = utcDayNumber(now);
  if (!gameActionSeed() && cached && cached.day === today) return cached;

  const stats = gameStatsRepository;
  const yesterdayDay = today - 1;
  const lastRatcheted = await stats.get(LAST_RATCHET_KEY);
  const earliest =
    yesterdayDay - SOCIAL_ECONOMY.pricing.emissionCatchUpDays + 1;
  const from = Math.max(
    earliest,
    lastRatcheted === null ? yesterdayDay : lastRatcheted + 1,
  );

  let highWater = (await stats.get(HIGH_WATER_KEY)) ?? 0;
  for (let day = from; day <= yesterdayDay; day++) {
    const emitted = (await stats.get(emissionDayKey(day))) ?? 0;
    highWater = await stats.setMax(HIGH_WATER_KEY, emitted);
  }
  if (lastRatcheted === null || yesterdayDay > lastRatcheted) {
    await stats.setMax(LAST_RATCHET_KEY, yesterdayDay);
  }

  const yesterday = (await stats.get(emissionDayKey(yesterdayDay))) ?? 0;
  const snapshot = { yesterday, highWater, day: today };
  if (!gameActionSeed()) cached = snapshot;
  return snapshot;
}
