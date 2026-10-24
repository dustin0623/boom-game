/**
 * app/test-modals/mockup-data.ts
 *
 * Centralised mock data for all modal test harnesses.
 * Import from here in each modal stub — never inline magic values.
 */

import { HeroRarity, HeroType } from "@/features/types/HeroRarity";

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export interface MockHeroListing {
  id:          string;
  heroNumber:  number;
  name:        string;
  rarity:      HeroRarity;
  type:        HeroType;
  /** Power stat */
  power:       number;
  speed:       number;
  stamina:     number;
  bombNum:     number;
  bombRange:   number;
  /** Token price */
  price:       number;
  sellerWallet: string;
  listedAt:    number;
  featured?:   boolean;
}

export const MOCK_HERO_LISTINGS: MockHeroListing[] = [
  {
    id:           "ml-001",
    heroNumber:   42,
    name:         "Hero #42",
    rarity:       HeroRarity.Legendary,
    type:         HeroType.RedHorn,
    power:        9,
    speed:        8,
    stamina:      9,
    bombNum:      3,
    bombRange:    5,
    price:        2500,
    sellerWallet: "8xBq...k3Pz",
    listedAt:     Date.now() - 3_600_000,
    featured:     true,
  },
  {
    id:           "ml-002",
    heroNumber:   117,
    name:         "Hero #117",
    rarity:       HeroRarity.Epic,
    type:         HeroType.Ghosty,
    power:        7,
    speed:        6,
    stamina:      7,
    bombNum:      2,
    bombRange:    4,
    price:        800,
    sellerWallet: "3mNr...w9Lx",
    listedAt:     Date.now() - 7_200_000,
    featured:     true,
  },
  {
    id:           "ml-003",
    heroNumber:   5,
    name:         "Hero #5",
    rarity:       HeroRarity.Rare,
    type:         HeroType.Bolt,
    power:        5,
    speed:        5,
    stamina:      6,
    bombNum:      2,
    bombRange:    3,
    price:        320,
    sellerWallet: "7hTv...m2Qa",
    listedAt:     Date.now() - 10_800_000,
  },
  {
    id:           "ml-004",
    heroNumber:   88,
    name:         "Hero #88",
    rarity:       HeroRarity.Uncommon,
    type:         HeroType.Mossy,
    power:        4,
    speed:        4,
    stamina:      4,
    bombNum:      2,
    bombRange:    2,
    price:        95,
    sellerWallet: "2cWd...p5Yk",
    listedAt:     Date.now() - 14_400_000,
  },
  {
    id:           "ml-005",
    heroNumber:   201,
    name:         "Hero #201",
    rarity:       HeroRarity.Common,
    type:         HeroType.Timmy,
    power:        2,
    speed:        3,
    stamina:      2,
    bombNum:      1,
    bombRange:    1,
    price:        20,
    sellerWallet: "9pKf...b1Zt",
    listedAt:     Date.now() - 18_000_000,
  },
  {
    id:           "ml-006",
    heroNumber:   333,
    name:         "Hero #333",
    rarity:       HeroRarity.Epic,
    type:         HeroType.Pinky,
    power:        8,
    speed:        7,
    stamina:      8,
    bombNum:      3,
    bombRange:    4,
    price:        1200,
    sellerWallet: "5jGs...n4Ue",
    listedAt:     Date.now() - 21_600_000,
  },
  {
    id:           "ml-007",
    heroNumber:   77,
    name:         "Hero #77",
    rarity:       HeroRarity.Rare,
    type:         HeroType.Rascal,
    power:        6,
    speed:        5,
    stamina:      5,
    bombNum:      2,
    bombRange:    3,
    price:        450,
    sellerWallet: "1rAe...f7Jb",
    listedAt:     Date.now() - 25_200_000,
  },
  {
    id:           "ml-008",
    heroNumber:   512,
    name:         "Hero #512",
    rarity:       HeroRarity.Common,
    type:         HeroType.Ricky,
    power:        1,
    speed:        2,
    stamina:      3,
    bombNum:      1,
    bombRange:    1,
    price:        15,
    sellerWallet: "4nDh...c8Wm",
    listedAt:     Date.now() - 28_800_000,
  },
];

/** Recent high-value sales for the "Top Sales" strip. */
export interface MockTopSale {
  heroName:    string;
  rarity:      HeroRarity;
  type:        HeroType;
  buyerWallet: string;
  price:       number;
}

export const MOCK_TOP_SALES: MockTopSale[] = [
  { heroName: "Hero #42",  rarity: HeroRarity.Legendary, type: HeroType.RedHorn, buyerWallet: "DustinXYZ",  price: 2500 },
  { heroName: "Hero #333", rarity: HeroRarity.Epic,      type: HeroType.Pinky,   buyerWallet: "BlockRaider", price: 1200 },
  { heroName: "Hero #117", rarity: HeroRarity.Epic,      type: HeroType.Ghosty,  buyerWallet: "0xCryptoKid", price: 800  },
  { heroName: "Hero #77",  rarity: HeroRarity.Rare,      type: HeroType.Rascal,  buyerWallet: "MineKing",    price: 450  },
  { heroName: "Hero #5",   rarity: HeroRarity.Rare,      type: HeroType.Bolt,    buyerWallet: "SatoshiMine", price: 320  },
];

/** Ticker footer stats. */
export const MOCK_MARKETPLACE_STATS = {
  totalVolume:  "5,280,000",
  totalTrades:  "12,841",
  activeListings: "423",
};

/** Mock player token balance. */
export const MOCK_TOKEN_BALANCE = 1250;
