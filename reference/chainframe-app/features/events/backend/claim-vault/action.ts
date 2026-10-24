import { withDatabasePreparation } from "@/lib/utils/database/operation.server";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
// template/features/events/backend/claim-vault/action.ts
import { claimCharges } from "@/features/types/game/charges";

import {
  tickPlayer,
  tickPatch,
} from "@/features/events/backend/tick-player/action";
import { gameActionNow } from "@/lib/utils/game/execution-context.server";
import { recordEmission } from "@/features/events/backend/shop-pricing/emission.server";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { equippedIds } from "@/features/types/game/stats";

export interface ClaimVaultResult {
  ok: boolean;
  claimed?: number;
  error?: string;
}

export async function claimVault(wallet: string): Promise<ClaimVaultResult> {
  let player = await playerRepository.findByWallet(wallet);
  if (!player) return { ok: false, error: "Player not found" };
  const charges = claimCharges(
    { charges: player.claimCharges, lastRegenAt: player.lastClaimRegenAt },
    gameActionNow(),
  );
  player.claimCharges = charges.current;
  player.lastClaimRegenAt = charges.lastRegenAt;
  await withDatabasePreparation(() =>
    playerRepository.recordClaimChargeRegen(
      wallet,
      charges.current,
      charges.lastRegenAt,
    ),
  );
  if (player.claimCharges <= 0) return { ok: false, error: "No claim charges" };

  // Bring vault up to date before reading it: without this, a claim right
  // after login (or any stretch since the last GET-triggered tick) would pay
  // out the stale DB value instead of everything actually mined so far.
  const ids = equippedIds(player);
  ({ player } = tickPlayer(player, ids.length ? await equipmentRepository.findByIds(ids) : []));
  if (player.vault <= 0) return { ok: false, error: "Vault is empty" };
  // Persist the tick (stats/vault/lastTickAt/version) first so it isn't lost
  // — the claim update below only touches the claim-specific fields.
  // Scoped to only the fields tick actually changed (never a full-document
  // $set) so this can't clobber a concurrent stake/burn's atomic $inc to an
  // unrelated field like vaultStaked or notoriety.
  await playerRepository.applyTick(wallet, tickPatch(player));

  const claimable = player.vault;
  await playerRepository.recordClaim(wallet, claimable);
  // The tick above already priced the elapsed time with any Hash Rate effect; a claim then
  // resets every stat effect so mining continues at the full rate.
  await playerRepository.clearStatEffects(wallet);

  await logRepository.create({
    type: "claim",
    wallet,
    amount: claimable,
    data: { chargesRemaining: player.claimCharges - 1 },
  });

  // Fire-and-forget: track global claimed HASH.
  await gameStatsRepository.increment("totalHashClaimed", claimable);

  // Daily emission sets tomorrow's shop prices, so it is awaited. The claim
  // itself already succeeded; a failure here must not turn it into an error.
  try {
    await recordEmission(claimable, gameActionNow());
  } catch (error) {
    throw error;
  }

  return { ok: true, claimed: claimable };
}
