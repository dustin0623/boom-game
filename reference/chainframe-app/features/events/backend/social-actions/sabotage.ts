import { inventoryItemRepository } from "@/lib/modules/items/server.repository";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { gameActionNow } from "@/lib/utils/game/execution-context.server";

import type {
  ConsumableId,
  StatEffectTarget,
} from "@/features/types/game/consumables";
import { type Rng } from "@/features/types/game/exposure";
import {
  STAT_EFFECT_LABELS,
  canApplySabotage,
  rollStatEffectStrength,
  socialActionSucceeds,
  socialActionSuccessChance,
  type StatEffect,
} from "@/features/types/game/stat-effects";

import { settleTick } from "@/features/events/backend/tick-player/action";
import { resolvePlayerStats } from "@/features/events/backend/tick-player/action";
import { withSocialPreparation } from "./preparation";

export type UseSabotageErrorCode =
  | "caller_not_found"
  | "target_not_found"
  | "self_target"
  | "invalid_stat"
  | "wrong_item_kind"
  | "no_item"
  | "already_sabotaged"
  | "target_protected"
  | "duplicate_request"
  | "rate_limited";

export type UseSabotageResult = {
  ok: boolean;
  success?: boolean;
  itemConsumed?: boolean;
  itemId?: ConsumableId;
  target?: string;
  stat?: StatEffectTarget;
  /** Authoritative effect as stored, so the client never has to guess the rolled strength. */
  effect?: StatEffect;
  error?: string;
  code?: UseSabotageErrorCode;
};

const fail = (
  code: UseSabotageErrorCode,
  error: string,
): UseSabotageResult => ({ ok: false, code, error });

/**
 * Spends one Sabotage consumable to weaken one chosen stat of `target`.
 *
 * The item is consumed first (guarded, atomic), then the effect is applied with a
 * conditional write that fails if that stat already holds an active effect. If applying
 * fails the item is restored, so a guarded-write rejection restores the item; failed Luck rolls consume it. Strength is
 * rolled server-side from the caller's Luck and an independent strength roll. Awards no Notoriety, XP or HASH.
 */
export async function sabotageTarget(
  caller: string,
  target: string,
  itemId: ConsumableId,
  stat: StatEffectTarget,
  rng: Rng = Math.random,
): Promise<UseSabotageResult> {
  return withSocialPreparation<UseSabotageResult>(
    "sabotage",
    { caller, target, itemId, stat },
    async ({ callerPlayer, targetPlayer }) => {
      const label = STAT_EFFECT_LABELS[stat];
      if (canApplySabotage(targetPlayer.statEffects ?? {}, stat)) {
        return fail("already_sabotaged", `${label} is already sabotaged`);
      }
      // A protected target cannot be raided right now, so the effect could not be reset by an attack.
      if (targetPlayer.protectionUntil > gameActionNow()) {
        return fail("target_protected", "Target is currently protected");
      }

      const stats = await resolvePlayerStats(callerPlayer);
      socialActionSuccessChance(stats.luck);
      const consumed = await inventoryItemRepository.consume(caller, itemId);
      if (!consumed.ok) return fail("no_item", "You do not own this item");
      if (!socialActionSucceeds(stats.luck, rng)) {
        await logRepository.create({
          type: "sabotage", wallet: caller, target: targetPlayer.wallet, amount: 0,
          data: { target, itemId, stat, success: false, itemConsumed: true, strength: 0, critical: false },
        });
        return { ok: true, success: false, itemConsumed: true, itemId, target, stat };
      }

      // A fully countered effect is replaced, which drops its history. Credit the mining it
      // covered first so the new effect cannot re-price that time.
      if (stat === "hashRate" && targetPlayer.statEffects?.hashRate) {
        await settleTick(targetPlayer.wallet);
      }

      const appliedAt = gameActionNow();
      const { strength, critical } = rollStatEffectStrength({ rng });
      const effect: StatEffect = {
        stat,
        itemId,
        appliedBy: caller,
        appliedAt,
        active: true,
        strength,
        critical,
        helps: [],
      };

      const applied = await playerRepository.applyStatSabotage(target, effect);
      if (!applied.ok) {
        await inventoryItemRepository.grant(caller, itemId, 1);
        return fail("already_sabotaged", `${label} is already sabotaged`);
      }

      try {
        await logRepository.create({
          type: "sabotage",
          wallet: caller,
          target: targetPlayer.wallet,
          amount: 0,
          data: { target, itemId, stat, strength, critical, success: true, itemConsumed: true },
        });
      } catch (logErr) {
        // The effect is already applied; a failed audit write must not undo or hide it.
        throw logErr;
      }

      return { ok: true, success: true, itemConsumed: true, itemId, target, stat, effect };
    },
  );
}
