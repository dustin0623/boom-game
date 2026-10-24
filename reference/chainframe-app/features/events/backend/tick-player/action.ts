import { withDatabasePreparation } from "@/lib/utils/database/operation.server";
import type {
  PlayerRecord,
  TickPatch,
} from "@/lib/modules/players/server.types";

import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { equippedIds, resolvedPlayerStats, type EquippedStatInput, type EquippedStatRecord } from "@/features/types/game/stats";
import { vaultAtTime } from "@/features/types/game/mining";

import { gameActionNow } from "@/lib/utils/game/execution-context.server";

type IPlayer = PlayerRecord;

/**
 * Resolve current totals from permanent inputs and validated equipment references.
 */
export async function resolvePlayerStats(player: EquippedStatInput) {
  const ids = equippedIds(player);
  return resolvedPlayerStats(player, ids.length ? await equipmentRepository.findByIds(ids) : []);
}

/**
 * `tick-player` is a shared dependency, not an HTTP-facing event on its own
 * — the smart contract processor and `claim-vault` / `raid-player`
 * call it internally to bring the vault up to date before their own logic
 * reads it. Both `tickPlayer` and `tickPatch` are exported for those
 * callers to import directly.
 */
export function tickPlayer(player: IPlayer, equipment: readonly EquippedStatRecord[] = []): {
  player: IPlayer;
  mined: number;
} {
  const now = Math.max(player.lastTickAt, gameActionNow());
  const vaultBefore = player.vault;

  // Recompute effective stats and persist them so every other server route
  // can read player.stats.hashRate instead of recalculating.
  player.stats = resolvedPlayerStats(player, equipment);

  player.vault = vaultAtTime(player, now);
  player.lastTickAt = now;
  player.milestones.totalMined = Number(
    (player.milestones.totalMined + player.vault - vaultBefore).toFixed(6),
  );
  player.version = (player.version ?? 0) + 1;

  if (player.vault > player.milestones.bestHashRate) {
    player.milestones.bestHashRate = player.vault;
  }

  return { player, mined: player.vault - vaultBefore };
}

/**
 * Narrow $set payload for persisting a `tickPlayer` result — only the fields
 * tick actually touches (vault, stats, lastTickAt, two milestone counters,
 * version). A field-scoped $set here means a tick write can never clobber a
 * sibling request's atomic update to an unrelated field (e.g. vaultStaked,
 * notoriety) like a full-document write would.
 */
export function tickPatch(player: IPlayer): TickPatch {
  return {
    vault: player.vault,
    stats: player.stats,
    lastTickAt: player.lastTickAt,
    milestones: {
      totalMined: player.milestones.totalMined,
      bestHashRate: player.milestones.bestHashRate,
    },
    version: player.version,
  };
}

/**
 * Persists a tick for `wallet` now. Called before a Hash Rate effect is replaced or cleared,
 * so HASH mined while it was in force is credited at the effected rate and nothing mined
 * before the change is re-priced afterwards.
 */
export async function settleTick(wallet: string): Promise<void> {
  const record = await playerRepository.findByWallet(wallet);
  if (!record) return;
  const ids = equippedIds(record);
  const { player } = tickPlayer(record, ids.length ? await equipmentRepository.findByIds(ids) : []);
  await withDatabasePreparation(() =>
    playerRepository.applyTick(wallet, tickPatch(player)),
  );
}
