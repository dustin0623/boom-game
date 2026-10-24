import {
  CHARGE_REGEN_MS,
  MAX_CLAIM_CHARGES,
  MAX_RAID_CHARGES,
  RAID_CHARGE_DECAY_DAYS,
} from "@/lib/config/constants/game";

export interface ChargeState {
  /** Charges banked at `lastRegenAt`. */
  charges: number;
  lastRegenAt: number;
}

export interface ChargeSnapshot {
  current: number;
  max: number;
  lastRegenAt: number;
  msUntilNext: number | null;
}

/**
 * Effective max raid charges: the cap shrinks by one per idle stretch since
 * the last HASH sink (upgrade or chest), never below one.
 */
export const effectiveMaxRaidCharges = (
  lastSinkAt: number | null | undefined,
  now = Date.now(),
): number => {
  if (!lastSinkAt) return MAX_RAID_CHARGES;
  const daysIdle = Math.floor((now - lastSinkAt) / 86_400_000);
  const decay = Math.floor(daysIdle / RAID_CHARGE_DECAY_DAYS);
  return Math.max(1, MAX_RAID_CHARGES - decay);
};

/** Regenerate charges at one per CHARGE_REGEN_MS, capped at `max`. */
export const regenCharges = (
  state: ChargeState,
  max: number,
  now = Date.now(),
): ChargeSnapshot => {
  const elapsed = Math.max(0, now - state.lastRegenAt);
  const gained = Math.floor(elapsed / CHARGE_REGEN_MS);
  const current = Math.min(max, state.charges + gained);
  // While charges sit at max the regen clock would go stale, which would
  // instantly refund the next charge spent. Anchor it to now instead.
  const lastRegenAt =
    current >= max
      ? now
      : gained > 0
        ? state.lastRegenAt + gained * CHARGE_REGEN_MS
        : state.lastRegenAt;
  return {
    current,
    max,
    lastRegenAt,
    msUntilNext:
      current >= max
        ? null
        : CHARGE_REGEN_MS - ((now - lastRegenAt) % CHARGE_REGEN_MS),
  };
};

export const claimCharges = (
  state: ChargeState,
  now = Date.now(),
): ChargeSnapshot => regenCharges(state, MAX_CLAIM_CHARGES, now);

export const raidCharges = (
  state: ChargeState,
  lastSinkAt: number | null | undefined,
  now = Date.now(),
): ChargeSnapshot =>
  regenCharges(state, effectiveMaxRaidCharges(lastSinkAt, now), now);
