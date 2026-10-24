export enum HeroRarity {
  Common = "common",
  Uncommon = "uncommon",
  Rare = "rare",
  Epic = "epic",
  Legendary = "legendary",
}

export interface HeroAttributes {
  power: number;
  speed: number;
  stamina: number;
  bombNum: number;
  bombRange: number;
  energy: number;
}

interface Range {
  min: number;
  max: number;
}

interface RarityDef {
  weight: number; // percent
  power: Range;
  speed: Range;
  stamina: Range;
  bombNum: number;
  bombRange: Range;
  tint: number;
  label: string;
}

export const HERO_RARITY_DEFS: Record<HeroRarity, RarityDef> = {
  [HeroRarity.Common]: {
    weight: 80.0,
    power: { min: 1, max: 3 },
    speed: { min: 1, max: 3 },
    stamina: { min: 1, max: 3 },
    bombNum: 1,
    bombRange: { min: 1, max: 2 },
    tint: 0x9ca3af,
    label: "Common",
  },
  [HeroRarity.Uncommon]: {
    weight: 14.0,
    power: { min: 3, max: 6 },
    speed: { min: 3, max: 6 },
    stamina: { min: 3, max: 6 },
    bombNum: 2,
    bombRange: { min: 2, max: 3 },
    tint: 0x22c55e,
    label: "Uncommon",
  },
  [HeroRarity.Rare]: {
    weight: 5.0,
    power: { min: 6, max: 8 },
    speed: { min: 6, max: 8 },
    stamina: { min: 6, max: 8 },
    bombNum: 3,
    bombRange: { min: 3, max: 5 },
    tint: 0x3b82f6,
    label: "Rare",
  },
  [HeroRarity.Epic]: {
    weight: 0.995,
    power: { min: 8, max: 11 },
    speed: { min: 8, max: 11 },
    stamina: { min: 8, max: 11 },
    bombNum: 4,
    bombRange: { min: 5, max: 7 },
    tint: 0xa855f7,
    label: "Epic",
  },
  [HeroRarity.Legendary]: {
    weight: 0.005,
    power: { min: 11, max: 16 },
    speed: { min: 11, max: 16 },
    stamina: { min: 11, max: 16 },
    bombNum: 6,
    bombRange: { min: 7, max: 11 },
    tint: 0xfacc15,
    label: "Legendary",
  },
};

export enum HeroType {
  Ricky    = "Ricky",
  Rocky    = "Rocky",
  Rascal   = "Rascal",
  RedHorn  = "Red Horn",
  Ducky    = "Ducky",
  Bolt     = "Bolt",
  Pinky    = "Pinky",
  Mossy    = "Mossy",
  Ghosty   = "Ghosty",
  Timmy    = "Timmy",
}

export const HERO_TYPES: HeroType[] = Object.values(HeroType);

/** Sprite sheet key for each hero type. Files live in /assets/characters/. */
export const HERO_SPRITES: Record<HeroType, string> = {
  [HeroType.Ricky]:   "ricky",
  [HeroType.Rocky]:   "rocky",
  [HeroType.Rascal]:  "rascal",
  [HeroType.RedHorn]: "redhorn",
  [HeroType.Ducky]:   "ducky",
  [HeroType.Bolt]:    "bolt",
  [HeroType.Pinky]:   "pinky",
  [HeroType.Mossy]:   "mossy",
  [HeroType.Ghosty]:  "ghosty",
  [HeroType.Timmy]:   "timmy",
};

/** Sprite sheet layout: 3 cols x 4 rows of 16x20 frames.
 *  Row 0 = walk down, 1 = walk left, 2 = walk right, 3 = walk up. */
export const HERO_SPRITE_FRAME_W = 16;
export const HERO_SPRITE_FRAME_H = 20;
export const HERO_SPRITE_COLS = 3;
export type HeroFacing = "down" | "left" | "right" | "up";
export const HERO_FACING_ROW: Record<HeroFacing, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

export function pickHeroRarity(rand: () => number): HeroRarity {
  const total = Object.values(HERO_RARITY_DEFS).reduce((s, v) => s + v.weight, 0);
  let r = rand() * total;
  for (const rarity of Object.keys(HERO_RARITY_DEFS) as HeroRarity[]) {
    r -= HERO_RARITY_DEFS[rarity].weight;
    if (r <= 0) return rarity;
  }
  return HeroRarity.Common;
}

function rollInt(rand: () => number, r: Range): number {
  return Math.floor(rand() * (r.max - r.min + 1)) + r.min;
}

export function rollHeroAttributes(rarity: HeroRarity, rand: () => number = Math.random): HeroAttributes {
  const def = HERO_RARITY_DEFS[rarity];
  const stamina = rollInt(rand, def.stamina);
  return {
    power: rollInt(rand, def.power),
    speed: rollInt(rand, def.speed),
    stamina,
    bombNum: def.bombNum,
    bombRange: rollInt(rand, def.bombRange),
    energy: stamina * 100,
  };
}

export function pickHeroType(rand: () => number = Math.random): HeroType {
  return HERO_TYPES[Math.floor(rand() * HERO_TYPES.length)];
}
