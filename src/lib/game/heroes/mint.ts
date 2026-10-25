import { pickHeroRarity, pickHeroType, rollHeroAttributes } from "@/game/data/HeroRarity";
import { MINT_COST } from "@/lib/config/constants/game";
import { rollSkills } from "./skills";
import type { SessionHero } from "@/lib/game/session/types";

/** Heroes mintable in one purchase (same limit as the Boom Miner reference). */
export const MAX_MINT_PER_TX = 10;

export function mintCost(count: number): number {
  return count * MINT_COST;
}

export function validMintCount(count: unknown): count is number {
  return typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_MINT_PER_TX;
}

/** Server-side roll: weighted rarity, random type, attributes within rarity ranges. id/number/name are assigned by the database. */
export function rollHero(rand: () => number = Math.random): Omit<SessionHero, "id" | "name" | "mintedNumber"> {
  const rarity = pickHeroRarity(rand);
  const type = pickHeroType(rand);
  const a = rollHeroAttributes(rarity, rand);
  return {
    type,
    rarity,
    power: a.power,
    speed: a.speed,
    stamina: a.stamina,
    bombNumber: a.bombNum,
    bombRange: a.bombRange,
    maxEnergy: a.energy,
    skills: rollSkills(rarity, rand),
  };
}
