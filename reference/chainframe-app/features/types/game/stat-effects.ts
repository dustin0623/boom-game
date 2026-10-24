import { SOCIAL_ACTION_BASE_SUCCESS_PERCENT } from "@/lib/config/constants/game";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import {
  CONSUMABLES,
  type ConsumableId,
  STAT_EFFECT_TARGETS,
  type StatEffectTarget,
} from "./consumables";
import type { Rng } from "./exposure";

export const STAT_EFFECT_LABELS: Record<StatEffectTarget, string> = {
  hashRate: "Hash Rate",
  hackPower: "Hack Power",
  security: "Security",
};

export const isStatEffectTarget = (value: unknown): value is StatEffectTarget =>
  typeof value === "string" &&
  (STAT_EFFECT_TARGETS as readonly string[]).includes(value);

export type StatEffectResetTrigger =
  (typeof SOCIAL_ECONOMY.statEffects.resetTriggers)[number];

/** A Help Kit applied against an active Sabotage on the same stat. */
export interface StatHelp {
  itemId: ConsumableId;
  appliedBy: string;
  appliedAt: number;
  /** Share of the stat restored, in (0, strengthCap]. */
  strength: number;
  critical: boolean;
}

/**
 * One Sabotage on one stat. The base stat level is never changed; the effect
 * only scales the effective value. It has no expiry time: it lasts until the
 * target claims or is raided.
 */
export interface StatEffect {
  stat: StatEffectTarget;
  /** The Sabotage Device that created the effect. */
  itemId: ConsumableId;
  appliedBy: string;
  appliedAt: number;
  active: boolean;
  /** Share of the stat removed when applied, in (0, strengthCap]. */
  strength: number;
  critical: boolean;
  /** Help applied against this effect, oldest first. */
  helps: StatHelp[];
}

/** At most one effect per stat; different stats may hold effects at the same time. */
export type StatEffects = Partial<Record<StatEffectTarget, StatEffect>>;

export type StatEffectRejection =
  | "invalid-stat"
  | "invalid-item"
  | "invalid-strength"
  | "duplicate-effect"
  | "no-active-effect";

export type StatEffectResult =
  | { ok: true; effects: StatEffects }
  | { ok: false; reason: StatEffectRejection };

const PRECISION = 1e9;
const roundStrength = (value: number): number =>
  Math.round(value * PRECISION) / PRECISION;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface StrengthRoll {
  strength: number;
  critical: boolean;
}

/** Player Luck adds to a base chance exclusive to Sabotage and Help. */
export const socialActionSuccessChance = (luck: number): number => {
  if (!Number.isFinite(luck)) throw new Error("Invalid Luck");
  return clamp(SOCIAL_ACTION_BASE_SUCCESS_PERCENT + luck, 0, 100);
};

export const socialActionSucceeds = (luck: number, rng: Rng): boolean => {
  const chance = socialActionSuccessChance(luck);
  return rng() < chance / 100;
};

/** After social success, draw uniform strength without a critical. */
export const rollStatEffectStrength = ({ rng }: { rng: Rng }): StrengthRoll => {
  const { strengthMin, strengthMax } = SOCIAL_ECONOMY.statEffects;
  const rawRoll = rng();
  const roll = clamp(Number.isFinite(rawRoll) ? rawRoll : 0, 0, 1);
  const base = strengthMin + roll * (strengthMax - strengthMin);
  return { strength: roundStrength(base), critical: false };
};

const isValidStrength = (strength: number): boolean =>
  Number.isFinite(strength) &&
  strength > 0 &&
  strength <= SOCIAL_ECONOMY.statEffects.strengthCap;

/** Sabotage strength still in force after Help has been subtracted. */
export const netEffectStrength = (
  effect: StatEffect | null | undefined,
): number => {
  if (!effect || !effect.active) return 0;
  const helped = effect.helps.reduce((sum, help) => sum + help.strength, 0);
  return roundStrength(
    clamp(effect.strength - helped, 0, SOCIAL_ECONOMY.statEffects.strengthCap),
  );
};

/**
 * Sabotage strength in force at one instant. Unlike `netEffectStrength` this reads the
 * effect's own history: it is zero before the Sabotage landed and only subtracts Help that
 * had already landed by `atMs`. That lets elapsed time be accounted for exactly, however late
 * the accounting runs.
 */
export const strengthAt = (
  effect: StatEffect | null | undefined,
  atMs: number,
): number => {
  if (!effect || !Number.isFinite(atMs) || atMs < effect.appliedAt) return 0;
  const helped = effect.helps.reduce(
    (sum, help) => (help.appliedAt <= atMs ? sum + help.strength : sum),
    0,
  );
  return roundStrength(
    clamp(effect.strength - helped, 0, SOCIAL_ECONOMY.statEffects.strengthCap),
  );
};

export interface StrengthSegment {
  seconds: number;
  /** Sabotage strength in force for the whole segment. */
  strength: number;
}

/**
 * Splits `[fromMs, toMs]` at the moment the Sabotage landed and at every Help, so each segment
 * has one constant strength. Segment seconds always add up to the whole interval. Without an
 * effect the result is a single unaffected segment.
 */
export const strengthSegments = (
  effect: StatEffect | null | undefined,
  fromMs: number,
  toMs: number,
): StrengthSegment[] => {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs)
    return [];
  if (!effect) return [{ seconds: (toMs - fromMs) / 1000, strength: 0 }];

  const cuts = [effect.appliedAt, ...effect.helps.map((help) => help.appliedAt)]
    .filter((at) => at > fromMs && at < toMs)
    .sort((a, b) => a - b);
  const points = [fromMs, ...cuts, toMs];
  const segments: StrengthSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end > start)
      segments.push({
        seconds: (end - start) / 1000,
        strength: strengthAt(effect, start),
      });
  }
  return segments;
};

export const isStatEffectActive = (
  effect: StatEffect | null | undefined,
): effect is StatEffect => netEffectStrength(effect) > 0;

/** Any remaining sabotage by this actor blocks Help on the entire target. */
export const hasActiveSabotageBy = (
  effects: StatEffects | null | undefined,
  actor: string,
): boolean =>
  STAT_EFFECT_TARGETS.some((stat) => {
    const effect = effects?.[stat];
    return effect?.appliedBy === actor && isStatEffectActive(effect);
  });

/** Base stat scaled by the remaining Sabotage. Never negative; the base is untouched. */
export const effectiveStatValue = (
  baseValue: number,
  effect: StatEffect | null | undefined,
): number => {
  const base = Number.isFinite(baseValue) ? Math.max(0, baseValue) : 0;
  return base * (1 - netEffectStrength(effect));
};

/** What a client may see of an effect: no actor wallet and no item id. */
export interface PublicStatEffect {
  /** Sabotage strength still in force after Help. */
  strength: number;
  /** Strength before any Help. */
  originalStrength: number;
  critical: boolean;
  helped: boolean;
}

export type PublicStatEffects = Partial<
  Record<StatEffectTarget, PublicStatEffect>
>;

/** Active effects only, stripped of who applied them and with which item. */
export const publicStatEffects = (
  effects: StatEffects | null | undefined,
): PublicStatEffects => {
  const result: PublicStatEffects = {};
  if (!effects) return result;
  for (const stat of STAT_EFFECT_TARGETS) {
    const effect = effects[stat];
    if (!isStatEffectActive(effect)) continue;
    result[stat] = {
      strength: netEffectStrength(effect),
      originalStrength: effect.strength,
      critical: effect.critical,
      helped: effect.helps.length > 0,
    };
  }
  return result;
};

export interface ApplySabotageInput {
  stat: unknown;
  itemId: ConsumableId;
  appliedBy: string;
  appliedAt: number;
  strength: number;
  critical: boolean;
}

/** A stat may hold one active Sabotage; a fully countered one can be replaced. */
export const canApplySabotage = (
  effects: StatEffects,
  stat: unknown,
): StatEffectRejection | null => {
  if (!isStatEffectTarget(stat)) return "invalid-stat";
  return isStatEffectActive(effects[stat]) ? "duplicate-effect" : null;
};

export interface ApplyHelpInput {
  stat: unknown;
  itemId: ConsumableId;
  appliedBy: string;
  appliedAt: number;
  strength: number;
  critical: boolean;
}

/** Help can only counter a Sabotage that is still in force on the selected stat. */
export const canHelpCounter = (
  effects: StatEffects,
  stat: unknown,
): StatEffectRejection | null => {
  if (!isStatEffectTarget(stat)) return "invalid-stat";
  return isStatEffectActive(effects[stat]) ? null : "no-active-effect";
};

export const applyHelp = (
  effects: StatEffects,
  input: ApplyHelpInput,
): StatEffectResult => {
  const rejection = canHelpCounter(effects, input.stat);
  if (rejection) return { ok: false, reason: rejection };
  if (CONSUMABLES[input.itemId]?.kind !== "help")
    return { ok: false, reason: "invalid-item" };
  if (!isValidStrength(input.strength))
    return { ok: false, reason: "invalid-strength" };

  const stat = input.stat as StatEffectTarget;
  const current = effects[stat] as StatEffect;
  const help: StatHelp = {
    itemId: input.itemId,
    appliedBy: input.appliedBy,
    appliedAt: input.appliedAt,
    strength: roundStrength(input.strength),
    critical: input.critical,
  };
  const helped: StatEffect = { ...current, helps: [...current.helps, help] };
  return {
    ok: true,
    effects: {
      ...effects,
      [stat]: { ...helped, active: netEffectStrength(helped) > 0 },
    },
  };
};

export const isStatEffectResetTrigger = (
  value: unknown,
): value is StatEffectResetTrigger =>
  typeof value === "string" &&
  (SOCIAL_ECONOMY.statEffects.resetTriggers as readonly string[]).includes(
    value,
  );
