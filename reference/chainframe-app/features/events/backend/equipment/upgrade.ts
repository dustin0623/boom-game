import { settleTick } from "@/features/events/backend/tick-player/action";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
// template/features/events/backend/equipment/upgrade.ts
import { z } from "zod";

import {
  salvageValue,
  itemUpgradeCost,
  upgradedStats,
} from "@/features/types/game/items";
import { withDatabaseOperation } from "@/lib/utils/database/operation.server";
import { XP_PER_SPARK } from "@/features/types/game/level";
import type { StatRoll } from "@/features/types/game/types";

export const upgradeItemInput = z.object({ itemId: z.string().min(1) });

export type UpgradeItemInput = z.infer<typeof upgradeItemInput>;

export type UpgradeItemResult = { ok: boolean; cost?: number; error?: string };

export async function upgradeEquipment(
  wallet: string,
  id: string,
  levels = 1,
): Promise<UpgradeItemResult> {
  if (!Number.isInteger(levels) || levels < 1 || levels > 100)
    return { ok: false, error: "Invalid level count" };
  return withDatabaseOperation(async () => {
    const item = await equipmentRepository.findById(id);
    if (
      !item ||
      item.owner !== wallet ||
      item.purchaseReserved ||
      item.market?.isMarket ||
      item.salvaged
    )
      return { ok: false, error: "Item not found" };
    const player = await playerRepository.findByWallet(wallet);
    if (!player) return { ok: false, error: "Player not found" };
    // Simulate the existing per-level rounding and subtraction before spending.
    // A bulk request must be affordable in full before its first upgrade.
    let remaining = player.sparks;
    let planned = { stats: item.stats as StatRoll, level: item.level };
    for (let index = 0; index < levels; index++) {
      const cost = itemUpgradeCost(planned);
      if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(remaining))
        return { ok: false, error: "Invalid equipment upgrade cost" };
      if (remaining < cost) return { ok: false, error: "Not enough SPARKS" };
      remaining -= cost;
      planned = {
        stats: upgradedStats(planned.stats),
        level: planned.level + 1,
      };
    }
    let totalCost = 0;
    for (let index = 0; index < levels; index++) {
      const result = await upgradeEquipmentLevel(wallet, id);
      if (!result.ok) return result;
      totalCost += result.cost!;
    }
    return { ok: true, cost: totalCost };
  });
}

async function upgradeEquipmentLevel(
  wallet: string,
  id: string,
): Promise<UpgradeItemResult> {
  const item = await equipmentRepository.findById(id);
  if (
    !item ||
    item.owner !== wallet ||
    item.purchaseReserved ||
    item.market?.isMarket ||
    item.salvaged
  )
    return { ok: false, error: "Item not found" };
  await settleTick(wallet);
  const cost = itemUpgradeCost({
    stats: item.stats as StatRoll,
    level: item.level,
  });
  const { ok } = await playerRepository.debitSparks(wallet, cost);
  if (!ok) return { ok: false, error: "Not enough SPARKS" };

  const previousSpark = salvageValue({
    stats: item.stats as StatRoll,
    level: item.level,
  });

  const result = await equipmentRepository.upgrade(id, wallet);
  if (!result.ok) return result;

  // Award XP for the SPARK value the upgrade added to the item — the gap
  // between its salvage value before and after the stat bump — not the
  // SPARKS spent on the upgrade itself.
  const currentSpark = salvageValue({
    stats: result.item!.stats as StatRoll,
    level: result.item!.level,
  });
  const xpGain = Math.round(
    Math.max(0, currentSpark - previousSpark) * XP_PER_SPARK,
  );
  if (xpGain > 0) {
    await playerRepository.addXp(wallet, xpGain);
  }

  await logRepository.create({
    type: "upgrade",
    wallet,
    amount: -cost,
    data: { itemId: id, name: item.name, from: item.level, to: item.level + 1 },
  });

  return { ok: true, cost };
}
