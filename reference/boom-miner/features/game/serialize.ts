import { maxEnergyFor } from "@/lib/constants/game";
import { HERO_RARITY_DEFS, type HeroRarity, type HeroType } from "@/features/types/HeroRarity";
import type { RosterHero } from "@/features/store/gameStore";
import type { GameHero } from "./types";

export function heroToRoster(h: GameHero): RosterHero {
  return {
    id: h.id,
    name: h.name,
    minted_number: h.mintedNumber,
    description: "",
    image: null,
    owner: h.owner,
    level: h.level,
    rarity: h.rarity as HeroRarity,
    type: h.type as HeroType,
    rarityLabel: HERO_RARITY_DEFS[h.rarity as HeroRarity]?.label ?? h.rarity,
    attributes: {
      power: h.power,
      speed: h.speed,
      stamina: h.stamina,
      bomb_number: h.bombNumber,
      bomb_range: h.bombRange,
    },
    market: h.market,
    currentEnergy: h.energy,
    maxEnergy: h.maxEnergy,
    onMap: h.onMap,
    recoveryAt: h.recoveryAt,
  };
}

/**
 * Maps a raw IHero lean document (as returned by the server) into the
 * RosterHero shape used throughout the client store and HUD.
 * IHero uses `attributes.bombNumber / bombRange` (camelCase from Mongoose);
 * RosterHero uses `attributes.bomb_number / bomb_range` (NFT snake_case).
 */
export function documentToRoster(h: {
  _id?: unknown;
  ownerWallet?: string;
  minted_number: number;
  name: string;
  type: string;
  rarity: string;
  level: number;
  attributes: {
    power: number;
    speed: number;
    stamina: number;
    bombNumber?: number;
    bomb_number?: number;
    bombRange?: number;
    bomb_range?: number;
  };
  currentEnergy: number;
  maxEnergy: number;
  onMap: boolean;
  market: { listed: boolean; price: number; seller: string | null; created: number; sold: number };
}): RosterHero {
  const stamina = h.attributes.stamina;
  const maxE = h.maxEnergy ?? maxEnergyFor(stamina);
  return {
    id: String(h._id ?? h.minted_number),
    name: h.name,
    minted_number: h.minted_number,
    description: "",
    image: null,
    owner: h.ownerWallet ?? "",
    level: h.level,
    rarity: h.rarity as HeroRarity,
    attributes: {
      power: h.attributes.power,
      speed: h.attributes.speed,
      stamina,
      bomb_number: h.attributes.bombNumber ?? h.attributes.bomb_number ?? 1,
      bomb_range: h.attributes.bombRange ?? h.attributes.bomb_range ?? 1,
    },
    market: h.market,
    type: h.type as HeroType,
    rarityLabel: HERO_RARITY_DEFS[h.rarity as HeroRarity]?.label ?? h.rarity,
    currentEnergy: h.currentEnergy,
    maxEnergy: maxE,
    onMap: h.onMap,
  };
}
