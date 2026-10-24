import { EQUIPMENT_STATS_EFFECTIVE_AT } from "@/lib/config/constants/game";
import {
  decayMultiplier,
  effectiveHashRate,
  minedOverInterval,
  vaultCapacity,
} from "@/features/types/game/mining";
import type { PublicStatEffects } from "@/features/types/game/stat-effects";
export interface MiningSnapshot {
  vault: number;
  vaultStaked: number;
  lastTickAt: number;
  lastSinkAt: number;
  statLevels: { hashRate: number };
  stats?: { hashRate: number };
  statEffects: PublicStatEffects;
}
/** Read-only estimate using the worker mining calculation and the public effect strength. Effects are settled server-side before their strength changes. */
export function projectVault(snapshot: MiningSnapshot, now: number): number {
  const time = Math.max(snapshot.lastTickAt, now);
  const rate = effectiveHashRate(snapshot.statLevels.hashRate);
  const capacity = vaultCapacity(snapshot.vaultStaked, rate);
  const multiplier = 1 - Math.min(1, Math.max(0, snapshot.statEffects.hashRate?.strength ?? 0));
  const interval = (hashRate: number, fromMs: number, toMs: number) => minedOverInterval({
    baseHashRate: hashRate * multiplier,
    decay: decayMultiplier(snapshot.lastSinkAt, time),
    fromMs, toMs,
  });
  const mined = Math.max(0,
    interval(snapshot.statLevels.hashRate, snapshot.lastTickAt, Math.min(time, EQUIPMENT_STATS_EFFECTIVE_AT)) +
    interval(snapshot.stats?.hashRate ?? snapshot.statLevels.hashRate, Math.max(snapshot.lastTickAt, EQUIPMENT_STATS_EFFECTIVE_AT), time));
  return Number(Math.min(capacity, snapshot.vault + mined).toFixed(6));
}
