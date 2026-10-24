import { inventoryItemRepository } from "@/lib/modules/items/server.repository";
import { assertItemQuantity, type StartingItemAward } from "@/features/types/game/inventory";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import { withDatabaseOperation } from "@/lib/utils/database/operation.server";
import { z } from "zod";

import { statValueFromLevel } from "@/features/types/game/stats";
import { GLOBAL_MINERATE_KEY } from "@/lib/config/constants/economy";
import { REGISTRATION_STARTING_HASH } from "@/lib/config/constants/game";
const inputSchema = z.object({
  wallet: z.string().min(1),
  txId: z.string().min(1),
});
export async function registerPlayer(
  wallet: string,
  txId: string,
  startingItems: readonly StartingItemAward[] = [],
  onItemGranted?: (award: StartingItemAward) => Promise<void>,
): Promise<{ changed: boolean; startingHash: number; startingItems: StartingItemAward[] }> {
  const input = inputSchema.parse({ wallet, txId });
  const seen = new Set<string>();
  for (const award of startingItems) {
    assertItemQuantity(award.itemId, award.quantity);
    if (seen.has(award.itemId)) throw new Error("Duplicate registration item");
    seen.add(award.itemId);
  }
  return withDatabaseOperation(async () => {
    const registration = await playerRepository.markRegistered(
      input.wallet,
      input.txId,
      REGISTRATION_STARTING_HASH,
    );
    if (registration.changed)
      await gameStatsRepository.increment(
        GLOBAL_MINERATE_KEY,
        statValueFromLevel("hashRate", registration.minerate),
      );
    const granted: StartingItemAward[] = [];
    if (registration.changed) {
      for (const award of startingItems) {
        await inventoryItemRepository.grant(input.wallet, award.itemId, award.quantity);
        await onItemGranted?.(award);
        granted.push({ ...award });
      }
    }
    return { changed: registration.changed, startingHash: registration.changed ? REGISTRATION_STARTING_HASH : 0, startingItems: granted };
  });
}
