import { HeroRarity } from "@/game/data/HeroRarity";

/** One buyable shop entry. Chests open into a new bomber of the same rarity. */
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  /** Price in mined coins. */
  price: number;
  image: string;
  /** Rarity of the bomber this chest hatches. */
  heroRarity: HeroRarity;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "chest_common",
    name: "Common Chest",
    description: "Hatches a Common bomber. A steady worker for the early stages.",
    price: 5_000,
    image: "/game/items/chests/chest_common.png",
    heroRarity: HeroRarity.Common,
  },
  {
    id: "chest_uncommon",
    name: "Uncommon Chest",
    description: "Hatches an Uncommon bomber with better power and stamina.",
    price: 15_000,
    image: "/game/items/chests/chest_uncommon.png",
    heroRarity: HeroRarity.Uncommon,
  },
  {
    id: "chest_rare",
    name: "Rare Chest",
    description: "Hatches a Rare bomber. More bombs, longer reach.",
    price: 40_000,
    image: "/game/items/chests/chest_rare.png",
    heroRarity: HeroRarity.Rare,
  },
  {
    id: "chest_epic",
    name: "Epic Chest",
    description: "Hatches an Epic bomber with serious blast range.",
    price: 100_000,
    image: "/game/items/chests/chest_epic.png",
    heroRarity: HeroRarity.Epic,
  },
  {
    id: "chest_legendary",
    name: "Legendary Chest",
    description: "Hatches a Legendary bomber — the strongest crew member money can buy.",
    price: 250_000,
    image: "/game/items/chests/chest_legendary.png",
    heroRarity: HeroRarity.Legendary,
  },
];

export const SHOP_ITEM_BY_ID: Record<string, ShopItem> = Object.fromEntries(
  SHOP_ITEMS.map((item) => [item.id, item]),
);
