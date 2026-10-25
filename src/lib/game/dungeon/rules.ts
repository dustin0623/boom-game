import { RARITY_RECOVERY_FRACTION, RECOVERY_INTERVAL_SECONDS } from "@/lib/config/constants/game";
import { QUICK_REST_MULTIPLIER } from "@/lib/game/heroes/skills";
import type { GameHero, GameState } from "./types";

export const BOMB_FUSE_MS = 700;
export const movementSpeed = (stat: number) => 5 + stat * 0.6;
export const utcDate = (now: number) => new Date(now).toISOString().slice(0, 10);
export function energyAfterRest(
  energy: number,
  maxEnergy: number,
  rarity: string,
  elapsedMs: number,
  quickRest = false,
): number {
  const fraction = (RARITY_RECOVERY_FRACTION[rarity] ?? RARITY_RECOVERY_FRACTION['common'] ?? 0) * (quickRest ? QUICK_REST_MULTIPLIER : 1);
  return Math.min(
    maxEnergy,
    energy + (maxEnergy * fraction * Math.max(0, elapsedMs)) / 1000 / RECOVERY_INTERVAL_SECONDS,
  );
}

export function recoverEnergy(hero: GameHero, now: number, hasBombs: boolean): void {
  if (hero.onMap || hasBombs) return;
  hero.energy = energyAfterRest(hero.energy, hero.maxEnergy, hero.rarity, now - hero.recoveryAt, !!hero.skills?.includes("quick_rest"));
  hero.recoveryAt = now;
}

export function materializeRecovery(state: GameState, now: number): void {
  for (const hero of Object.values(state.heroes)) {
    recoverEnergy(
      hero,
      now,
      Object.values(state.bombs).some((bomb) => bomb.heroId === hero.id),
    );
  }
}
