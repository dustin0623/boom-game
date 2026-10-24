import { settleTick } from "@/features/events/backend/tick-player/action";
import type { PlayerRecord } from "@/lib/modules/players/server.types";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import { withDatabaseOperation } from "@/lib/utils/database/operation.server";
// template/features/events/backend/upgrade-stat/action.ts
import {
  statValueFromLevel,
  totalUpgradeCost,
} from "@/features/types/game/stats";
import { GLOBAL_MINERATE_KEY } from "@/lib/config/constants/economy";
import { z } from "zod";

import { XP_PER_HASH } from "@/features/types/game/level";
import { STAT_KEYS } from "@/lib/config/constants/game";
import type { StatKey } from "@/features/types/game/types";

/** Hard ceiling on a single bulk request, mirroring the client's iteration cap. */
export const MAX_BULK_UPGRADE_LEVELS = 10_000;

export const upgradeStatInput = z.object({
  stat: z.enum(STAT_KEYS as [StatKey, ...StatKey[]]),
  // Buy multiple levels in one request instead of one call per level.
  levels: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_BULK_UPGRADE_LEVELS)
    .default(1),
});

export type UpgradeStatInput = z.infer<typeof upgradeStatInput>;

export type UpgradeStatResult = {
  ok: boolean;
  cost?: number;
  levels?: number;
  error?: string;
};

/**
 * Buys `levels` stat upgrades in a single DB round trip: computes the total
 * cost for the whole batch, debits it once, and applies all levels at once.
 * This intentionally replaces any previous "call once per level" client
 * loop — buying 100 levels must never mean sending 100 requests.
 */
export async function upgradeStat(
  wallet: string,
  stat: keyof PlayerRecord["statLevels"],
  levels = 1,
): Promise<UpgradeStatResult> {
  const count = Math.floor(levels);
  if (!Number.isFinite(count) || count < 1)
    return { ok: false, error: "Invalid level count" };
  if (count > MAX_BULK_UPGRADE_LEVELS) {
    return {
      ok: false,
      error: `Cannot buy more than ${MAX_BULK_UPGRADE_LEVELS} levels at once`,
    };
  }

  return withDatabaseOperation(async () => {
    const player = await playerRepository.findByWallet(wallet);
    if (!player) return { ok: false, error: "Player not found" };

    if (stat === "hashRate") await settleTick(wallet);
    const fromLevel = player.statLevels[stat];
    const nextLevel = fromLevel + count;
    const cost = totalUpgradeCost(fromLevel, count);
    if (player.hash < cost) return { ok: false, error: "Not enough HASH" };
    const { ok } = await playerRepository.debitHash(wallet, cost);
    if (!ok) return { ok: false, error: "Not enough HASH" };

    // Persist the new stat level, recompute the effective stats block,
    // record the upgrade timestamp, increment the version counter, and award
    // XP for the HASH sunk into this upgrade.
    await playerRepository.recordStatUpgrade(
      wallet,
      stat,
      nextLevel,
      Math.round(cost * XP_PER_HASH),
    );

    if (stat === "hashRate" && player.isRegistered) {
      await gameStatsRepository.increment(
        GLOBAL_MINERATE_KEY,
        statValueFromLevel("hashRate", nextLevel) -
          statValueFromLevel("hashRate", fromLevel),
      );
    }

    await logRepository.create({
      type: "stat_upgrade",
      wallet,
      amount: -cost,
      data: { stat, from: fromLevel, to: nextLevel, levels: count },
    });

    return { ok: true, cost, levels: count };
  });
}
