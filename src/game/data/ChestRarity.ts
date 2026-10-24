export enum ChestRarity {
  Common = "common",
  Rare = "rare",
  Epic = "epic",
  Legendary = "legendary",
  Mythic = "mythic",
}

export interface ChestStats {
  hp: number;
  coins: number;
  tint: number;
  /** Map appearance chance, in percent (out of 100). */
  weight: number;
}

// Values per the Bomb Sol reference spec.
export const CHEST_STATS: Record<ChestRarity, ChestStats> = {
  [ChestRarity.Common]:    { hp: 20,   coins: 800,    tint: 0xb08a5a, weight: 80.0 },
  [ChestRarity.Rare]:      { hp: 160,  coins: 2400,   tint: 0x4aa3ff, weight: 13.0 },
  [ChestRarity.Epic]:      { hp: 320,  coins: 8000,   tint: 0xff9a2b, weight: 5.0 },
  [ChestRarity.Legendary]: { hp: 640,  coins: 32000,  tint: 0xb266ff, weight: 1.6 },
  [ChestRarity.Mythic]:    { hp: 1280, coins: 160000, tint: 0xff3b6b, weight: 0.4 },
};

// We only ship 5 chest PNGs — remap by rarity order (rarest → most striking art).
export const CHEST_TEXTURE: Record<ChestRarity, string> = {
  [ChestRarity.Common]:    "chest_common",
  [ChestRarity.Rare]:      "chest_uncommon",
  [ChestRarity.Epic]:      "chest_rare",
  [ChestRarity.Legendary]: "chest_epic",
  [ChestRarity.Mythic]:    "chest_legendary",
};

export function pickChestRarity(rand: () => number): ChestRarity {
  const total = Object.values(CHEST_STATS).reduce((s, v) => s + v.weight, 0);
  let r = rand() * total;
  for (const rarity of Object.keys(CHEST_STATS) as ChestRarity[]) {
    r -= CHEST_STATS[rarity].weight;
    if (r <= 0) return rarity;
  }
  return ChestRarity.Common;
}
