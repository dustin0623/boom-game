import {
  STAT_EFFECT_TARGETS,
  type StatEffectTarget,
  CONSUMABLE_IDS,
  CONSUMABLES,
  type ConsumableId,
  type ConsumableKind,
} from "@/features/types/game/consumables";

export const HELP_UNAVAILABLE_MESSAGE =
  "Not available. This player is not currently sabotaged.";
export const SABOTAGE_ACTIVE_MESSAGE = "This player is already sabotaged.";
export const NO_ITEM_MESSAGE = "You do not own any of these items.";
export const OWN_SABOTAGE_MESSAGE =
  "You cannot help a player you have sabotaged.";
export const HELP_ELIGIBILITY_UNKNOWN_MESSAGE =
  "Refresh targets to check Help eligibility.";

export type SocialActionBlock =
  | "no_item"
  | "not_sabotaged"
  | "already_sabotaged"
  | "own_sabotage"
  | "eligibility_unknown";

export interface SocialActionState {
  canUse: boolean;
  /** Why the action is disabled; `null` when it can be used. */
  blockedBy: SocialActionBlock | null;
  message: string | null;
}

/**
 * UI-only gating for Sabotage and Help. The server re-validates every rule, so
 * this only decides what to enable and which message to show. `sabotageActive`
 * is the public boolean from the raid targets response.
 */
export function socialActionState(input: {
  kind: ConsumableKind;
  sabotageActive: boolean;
  ownedQuantity: number;
  helpBlockedByOwnSabotage?: boolean | undefined;
}): SocialActionState {
  const { kind, sabotageActive, ownedQuantity } = input;

  if (kind === "help" && input.helpBlockedByOwnSabotage !== false) {
    const blocked = input.helpBlockedByOwnSabotage === true;
    return {
      canUse: false,
      blockedBy: blocked ? "own_sabotage" : "eligibility_unknown",
      message: blocked
        ? OWN_SABOTAGE_MESSAGE
        : HELP_ELIGIBILITY_UNKNOWN_MESSAGE,
    };
  }

  if (kind === "help" && !sabotageActive) {
    return {
      canUse: false,
      blockedBy: "not_sabotaged",
      message: HELP_UNAVAILABLE_MESSAGE,
    };
  }
  if (kind === "sabotage" && sabotageActive) {
    return {
      canUse: false,
      blockedBy: "already_sabotaged",
      message: SABOTAGE_ACTIVE_MESSAGE,
    };
  }
  if (ownedQuantity < 1) {
    return { canUse: false, blockedBy: "no_item", message: NO_ITEM_MESSAGE };
  }
  return { canUse: true, blockedBy: null, message: null };
}

/** Public per-stat Sabotage strength on a target (0-1); absent or zero means unaffected. */
export type ActiveEffects = Partial<Record<StatEffectTarget, number>>;

const isAffected = (
  effects: ActiveEffects | undefined,
  stat: StatEffectTarget,
): boolean => (effects?.[stat] ?? 0) > 0;

/** Stats that carry no Sabotage yet, so a new one can land. */
export const sabotageableStats = (
  effects: ActiveEffects | undefined,
): StatEffectTarget[] =>
  STAT_EFFECT_TARGETS.filter((stat) => !isAffected(effects, stat));

/** Stats with a Sabotage in force, so Help has something to counter. */
export const helpableStats = (
  effects: ActiveEffects | undefined,
): StatEffectTarget[] =>
  STAT_EFFECT_TARGETS.filter((stat) => isAffected(effects, stat));

/** Catalog items of one kind, in catalog order. */
export function consumableIdsOfKind(kind: ConsumableKind): ConsumableId[] {
  return CONSUMABLE_IDS.filter((id) => CONSUMABLES[id].kind === kind);
}
