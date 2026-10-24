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
  applyHelp,
  canHelpCounter,
  hasActiveSabotageBy,
  netEffectStrength,
  rollStatEffectStrength,
  socialActionSucceeds,
  socialActionSuccessChance,
  type StatEffect,
} from "@/features/types/game/stat-effects";

import { resolvePlayerStats } from "@/features/events/backend/tick-player/action";
import { withSocialPreparation } from "./preparation";

export type UseHelpErrorCode =
  | "caller_not_found"
  | "target_not_found"
  | "self_target"
  | "invalid_stat"
  | "wrong_item_kind"
  | "no_item"
  | "not_sabotaged"
  | "own_sabotage"
  | "already_helped"
  | "duplicate_request"
  | "rate_limited";

export type UseHelpResult = {
  ok: boolean;
  success?: boolean;
  itemConsumed?: boolean;
  itemId?: ConsumableId;
  target?: string;
  stat?: StatEffectTarget;
  /** Authoritative effect after this Help, so the client never has to guess. */
  effect?: StatEffect;
  /** Share of the stat this Help restored (before clamping to what remained). */
  strength?: number;
  /** Sabotage still in force on the stat after this Help; 0 means fully countered. */
  remainingStrength?: number;
  error?: string;
  code?: UseHelpErrorCode;
};

const fail = (code: UseHelpErrorCode, error: string): UseHelpResult => ({
  ok: false,
  code,
  error,
});

/**
 * Spends one Help consumable to counter the active Sabotage on one chosen stat of `target`.
 *
 * The item is consumed first (guarded, atomic), then the effect is replaced with a
 * compare-and-set that only succeeds while the stored effect is still the one this request
 * read, so two concurrent Help requests cannot both build on the same state. If applying
 * fails the item is restored, so a guarded-write rejection restores the item; failed Luck rolls consume it. Effect state is
 * always read from the database, never the client. Strength is rolled server-side from the
 * helper's Luck and an independent strength roll. Only the chosen stat changes. Awards no Notoriety, XP or HASH.
 */
export async function helpTarget(
  caller: string,
  target: string,
  itemId: ConsumableId,
  stat: StatEffectTarget,
  rng: Rng = Math.random,
): Promise<UseHelpResult> {
  return withSocialPreparation<UseHelpResult>(
    "help",
    { caller, target, itemId, stat },
    async ({ callerPlayer, targetPlayer }) => {
      const label = STAT_EFFECT_LABELS[stat];
      const effects = targetPlayer.statEffects ?? {};
      if (canHelpCounter(effects, stat)) {
        return fail("not_sabotaged", `${label} is not currently sabotaged`);
      }

      if (hasActiveSabotageBy(effects, caller)) {
        return fail(
          "own_sabotage",
          "You cannot help a player you have sabotaged.",
        );
      }

      const stats = await resolvePlayerStats(callerPlayer);
      socialActionSuccessChance(stats.luck);
      const consumed = await inventoryItemRepository.consume(caller, itemId);
      if (!consumed.ok) return fail("no_item", "You do not own this item");
      if (!socialActionSucceeds(stats.luck, rng)) {
        await logRepository.create({
          type: "help", wallet: caller, target: targetPlayer.wallet, amount: 0,
          data: { target, itemId, stat, success: false, itemConsumed: true, strength: 0, critical: false },
        });
        return { ok: true, success: false, itemConsumed: true, itemId, target, stat };
      }

      const appliedAt = gameActionNow();
      const { strength, critical } = rollStatEffectStrength({ rng });
      const countered = applyHelp(effects, {
        stat,
        itemId,
        appliedBy: caller,
        appliedAt,
        strength,
        critical,
      });
      const expected = effects[stat];
      const next = countered.ok ? countered.effects[stat] : undefined;
      if (!countered.ok || !expected || !next) {
        await inventoryItemRepository.grant(caller, itemId, 1);
        return fail("not_sabotaged", `${label} is not currently sabotaged`);
      }

      const applied = await playerRepository.replaceStatEffect(
        target,
        expected,
        next,
      );
      if (!applied.ok) {
        await inventoryItemRepository.grant(caller, itemId, 1);
        return fail(
          "already_helped",
          `${label} changed before your Help landed`,
        );
      }

      try {
        await logRepository.create({
          type: "help",
          wallet: caller,
          target: targetPlayer.wallet,
          amount: 0,
          data: {
            target,
            itemId,
            stat,
            strength,
            critical,
            success: true,
            itemConsumed: true,
            sabotagedBy: expected.appliedBy,
            remainingStrength: netEffectStrength(next),
          },
        });
      } catch (logErr) {
        // The effect is already updated; a failed audit write must not undo or hide it.
        throw logErr;
      }

      return {
        ok: true,
        success: true,
        itemConsumed: true,
        itemId,
        target,
        stat,
        effect: next,
        strength,
        remainingStrength: netEffectStrength(next),
      };
    },
  );
}
