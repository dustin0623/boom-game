/**
 * lib/modules/heroes/generate.ts
 *
 * Server-side hero generation — pure TS, no Phaser runtime.
 * Mirrors the makeHero() logic in gameStore.ts using the same constants.
 */

import {
  HeroRarity,
  HeroType,
  pickHeroRarity,
  pickHeroType,
  rollHeroAttributes,
  HERO_RARITY_DEFS,
} from "@/features/types/HeroRarity";
import { ENERGY_PER_STAMINA } from "@/lib/constants/game";
import type { IHero } from "./types.server";

export interface HeroSeed {
  ownerWallet: string;
  minted_number: number;
  name: string;
  type: HeroType;
  rarity: HeroRarity;
  level: number;
  attributes: { power: number; speed: number; stamina: number; bombNumber: number; bombRange: number };
  currentEnergy: number;
  maxEnergy: number;
  onMap: boolean;
  market: { listed: boolean; price: number; seller: null; created: number; sold: number };
}

/**
 * `minted_number` must be supplied by the caller (repository counts existing
 * docs to assign the next sequential number before calling this function).
 */
export function generateHero(ownerWallet: string, minted_number: number, rarity?: HeroRarity): HeroSeed {
  const r = rarity ?? pickHeroRarity(Math.random);
  const t = pickHeroType(Math.random);
  const a = rollHeroAttributes(r, Math.random);
  const maxEnergy = a.stamina * ENERGY_PER_STAMINA;

  return {
    ownerWallet,
    minted_number,
    name:        t,
    type:        t,
    rarity:      r,
    level:       1,
    attributes: {
      power:      a.power,
      speed:      a.speed,
      stamina:    a.stamina,
      bombNumber: a.bombNum,
      bombRange:  a.bombRange,
    },
    currentEnergy: maxEnergy,
    maxEnergy,
    onMap:  false,
    market: { listed: false, price: 0, seller: null, created: 0, sold: 0 },
  };
}
