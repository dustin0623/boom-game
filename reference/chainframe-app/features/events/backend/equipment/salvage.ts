import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";

import { salvageValue } from "@/features/types/game/items";
import { XP_PER_SPARK } from "@/features/types/game/level";

export type SalvageItemResult = Awaited<
  ReturnType<(typeof equipmentRepository)["salvage"]>
>;

export async function salvageItem(
  wallet: string,
  itemId: string,
): Promise<SalvageItemResult> {
  const result = await equipmentRepository.salvage(itemId, wallet);
  if (!result.ok || !result.item) return result;

  const sparks = salvageValue({
    level: result.item.level,
    stats: result.item.stats as never,
  });
  // The item repository only marks the item salvaged/unowned — it never
  // touches the player's balance, so the SPARKS payout has to happen
  // here or salvaging silently destroys the item for nothing.
  await playerRepository.creditSparks(wallet, sparks);

  // Burning (salvaging) an item is one of the two gear sinks that grant
  // XP — award it in proportion to the SPARKS the salvage paid out.
  const xpGain = Math.round(sparks * XP_PER_SPARK);
  if (xpGain > 0) {
    await playerRepository.addXp(wallet, xpGain);
  }

  await logRepository.create({
    type: "salvage",
    wallet,
    amount: sparks,
    data: {
      itemId: result.item.id,
      name: result.item.name,
      rarity: result.item.rarity,
      slot: result.item.slot,
      level: result.item.level,
      sparks,
    },
  });

  return result;
}
