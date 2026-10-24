import type { Rarity, SlotKey } from "@/features/types/game/types";

// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for every templateId in the game.
//
// This replaces the `templates` MongoDB collection entirely — there is no
// DB round-trip for template metadata anymore. Cosmetics (avatar/banner/
// background) are never persisted as owned rows anywhere; "ownership" is
// derived at read time from `player.level >= requiredLevel`. Gear (item)
// templates describe the slot+rarity combinations that live as real rows
// in the `items` collection.
//
// No `mintCount` / `maxSupply` / `mintNumber` fields exist here — there is
// no per-template edition tracking anymore.
// ─────────────────────────────────────────────────────────────────────────

export type CosmeticKind = "avatar" | "banner" | "background";
export type TemplateKind = CosmeticKind | "item";

export interface CosmeticTemplateEntry {
  templateId: number;
  kind: CosmeticKind;
  name: string;
  image: string;
  /** True only for the free starter template of each kind (0 / 100 / 200). */
  soulbound: boolean;
  /** Player level required to unlock/equip this cosmetic. */
  requiredLevel: number;
}

export interface ItemTemplateEntry {
  templateId: number;
  kind: "item";
  name: string;
  image: string;
  slot: SlotKey;
  rarity: Rarity;
}

export type TemplateEntry = CosmeticTemplateEntry | ItemTemplateEntry;

// ─── Cosmetic source data (before requiredLevel is computed) ──────────────
// templateId ranges: avatar 0–99, banner 100–199, background 200–299.
// Index 0 of each range is the soulbound default granted free on register.

type CosmeticSource = Omit<CosmeticTemplateEntry, "requiredLevel">;

const avatarSources: CosmeticSource[] = [
  {
    templateId: 0,
    kind: "avatar",
    name: "The Operator",
    image: "/assets/avatars/the-operator.png",
    soulbound: true,
  },
  {
    templateId: 1,
    kind: "avatar",
    name: "The Rig Runner",
    image: "/assets/avatars/the-rig-runner.png",
    soulbound: false,
  },
  {
    templateId: 2,
    kind: "avatar",
    name: "The Ghost",
    image: "/assets/avatars/the-ghost.png",
    soulbound: false,
  },
  {
    templateId: 3,
    kind: "avatar",
    name: "The Overclocker",
    image: "/assets/avatars/the-overclocker.png",
    soulbound: false,
  },
  {
    templateId: 4,
    kind: "avatar",
    name: "The Vault Keeper",
    image: "/assets/avatars/the-vault-keeper.png",
    soulbound: false,
  },
  {
    templateId: 5,
    kind: "avatar",
    name: "The Exploit",
    image: "/assets/avatars/the-exploit.png",
    soulbound: false,
  },
  {
    templateId: 6,
    kind: "avatar",
    name: "The Node",
    image: "/assets/avatars/the-node.png",
    soulbound: false,
  },
  {
    templateId: 7,
    kind: "avatar",
    name: "The Miner King",
    image: "/assets/avatars/the-miner-king.png",
    soulbound: false,
  },
  {
    templateId: 8,
    kind: "avatar",
    name: "The Phantom",
    image: "/assets/avatars/the-phantom.png",
    soulbound: false,
  },
  {
    templateId: 9,
    kind: "avatar",
    name: "The Architect",
    image: "/assets/avatars/the-architect.png",
    soulbound: false,
  },
  {
    templateId: 10,
    kind: "avatar",
    name: "The Rogue AI",
    image: "/assets/avatars/the-rogue-ai.png",
    soulbound: false,
  },
  {
    templateId: 11,
    kind: "avatar",
    name: "The Nomad",
    image: "/assets/avatars/the-nomad.png",
    soulbound: false,
  },
  {
    templateId: 12,
    kind: "avatar",
    name: "The Cryptobro",
    image: "/assets/avatars/the-cryptobro.png",
    soulbound: false,
  },
  {
    templateId: 13,
    kind: "avatar",
    name: "The Scavenger",
    image: "/assets/avatars/the-scavenger.png",
    soulbound: false,
  },
  {
    templateId: 14,
    kind: "avatar",
    name: "The Warlord",
    image: "/assets/avatars/the-warlord.png",
    soulbound: false,
  },
  {
    templateId: 15,
    kind: "avatar",
    name: "The Shadow Broker",
    image: "/assets/avatars/the-shadow-broker.png",
    soulbound: false,
  },
  {
    templateId: 16,
    kind: "avatar",
    name: "The Zero-Day",
    image: "/assets/avatars/the-zero-day.png",
    soulbound: false,
  },
  {
    templateId: 17,
    kind: "avatar",
    name: "The Blockchain Monk",
    image: "/assets/avatars/the-blockchain-monk.png",
    soulbound: false,
  },
  {
    templateId: 18,
    kind: "avatar",
    name: "The Ice Queen",
    image: "/assets/avatars/the-ice-queen.png",
    soulbound: false,
  },
  {
    templateId: 19,
    kind: "avatar",
    name: "The Payload",
    image: "/assets/avatars/the-payload.png",
    soulbound: false,
  },
  {
    templateId: 20,
    kind: "avatar",
    name: "The Ferret",
    image: "/assets/avatars/the-ferret.png",
    soulbound: false,
  },
  {
    templateId: 21,
    kind: "avatar",
    name: "The Sentry",
    image: "/assets/avatars/the-sentry.png",
    soulbound: false,
  },
  {
    templateId: 22,
    kind: "avatar",
    name: "The Drain",
    image: "/assets/avatars/the-drain.png",
    soulbound: false,
  },
  {
    templateId: 23,
    kind: "avatar",
    name: "The Oracle",
    image: "/assets/avatars/the-oracle.png",
    soulbound: false,
  },
  {
    templateId: 24,
    kind: "avatar",
    name: "The Syndicate Boss",
    image: "/assets/avatars/the-syndicate-boss.png",
    soulbound: false,
  },
];

const bannerSources: CosmeticSource[] = [
  {
    templateId: 100,
    kind: "banner",
    name: "The Data Mine",
    image: "/assets/banners/the-data-mine.png",
    soulbound: true,
  },
  {
    templateId: 101,
    kind: "banner",
    name: "Hash Canyon",
    image: "/assets/banners/hash-canyon.png",
    soulbound: false,
  },
  {
    templateId: 102,
    kind: "banner",
    name: "The Vault District",
    image: "/assets/banners/the-vault-district.png",
    soulbound: false,
  },
  {
    templateId: 103,
    kind: "banner",
    name: "Exploit City",
    image: "/assets/banners/exploit-city.png",
    soulbound: false,
  },
  {
    templateId: 104,
    kind: "banner",
    name: "The Rig Farm",
    image: "/assets/banners/the-rig-farm.png",
    soulbound: false,
  },
  {
    templateId: 105,
    kind: "banner",
    name: "Genesis Block",
    image: "/assets/banners/genesis-block.png",
    soulbound: false,
  },
  {
    templateId: 106,
    kind: "banner",
    name: "Circuit Wasteland",
    image: "/assets/banners/circuit-wasteland.png",
    soulbound: false,
  },
  {
    templateId: 107,
    kind: "banner",
    name: "The Network",
    image: "/assets/banners/the-network.png",
    soulbound: false,
  },
  {
    templateId: 108,
    kind: "banner",
    name: "Raid Night",
    image: "/assets/banners/raid-night.png",
    soulbound: false,
  },
  {
    templateId: 109,
    kind: "banner",
    name: "The Overclocked Sky",
    image: "/assets/banners/the-overclocked-sky.png",
    soulbound: false,
  },
  {
    templateId: 110,
    kind: "banner",
    name: "Deep Protocol",
    image: "/assets/banners/deep-protocol.png",
    soulbound: false,
  },
  {
    templateId: 111,
    kind: "banner",
    name: "Hash Horizon",
    image: "/assets/banners/hash-horizon.png",
    soulbound: false,
  },
  {
    templateId: 112,
    kind: "banner",
    name: "The Dark Pool",
    image: "/assets/banners/the-dark-pool.png",
    soulbound: false,
  },
  {
    templateId: 113,
    kind: "banner",
    name: "Firewall Fortress",
    image: "/assets/banners/firewall-fortress.png",
    soulbound: false,
  },
  {
    templateId: 114,
    kind: "banner",
    name: "The Syndicate Lounge",
    image: "/assets/banners/the-syndicate-lounge.png",
    soulbound: false,
  },
  {
    templateId: 115,
    kind: "banner",
    name: "Zero Day Dawn",
    image: "/assets/banners/zero-day-dawn.png",
    soulbound: false,
  },
  {
    templateId: 116,
    kind: "banner",
    name: "Block Storm",
    image: "/assets/banners/block-storm.png",
    soulbound: false,
  },
  {
    templateId: 117,
    kind: "banner",
    name: "Cold Storage",
    image: "/assets/banners/cold-storage.png",
    soulbound: false,
  },
  {
    templateId: 118,
    kind: "banner",
    name: "Notoriety Row",
    image: "/assets/banners/notoriety-row.png",
    soulbound: false,
  },
  {
    templateId: 119,
    kind: "banner",
    name: "The Patch",
    image: "/assets/banners/the-patch.png",
    soulbound: false,
  },
  {
    templateId: 120,
    kind: "banner",
    name: "Liquidation Event",
    image: "/assets/banners/liquidation-event.png",
    soulbound: false,
  },
  {
    templateId: 121,
    kind: "banner",
    name: "Genesis Crater",
    image: "/assets/banners/genesis-crater.png",
    soulbound: false,
  },
  {
    templateId: 122,
    kind: "banner",
    name: "The Leaderboard Tower",
    image: "/assets/banners/the-leaderboard-tower.png",
    soulbound: false,
  },
  {
    templateId: 123,
    kind: "banner",
    name: "Protocol Graveyard",
    image: "/assets/banners/protocol-graveyard.png",
    soulbound: false,
  },
  {
    templateId: 124,
    kind: "banner",
    name: "The Final Hash",
    image: "/assets/banners/the-final-hash.png",
    soulbound: false,
  },
];

const backgroundSources: CosmeticSource[] = [
  {
    templateId: 200,
    kind: "background",
    name: "The Deep Mine",
    image: "/assets/backgrounds/the-deep-mine.png",
    soulbound: true,
  },
  {
    templateId: 201,
    kind: "background",
    name: "Circuit Horizon",
    image: "/assets/backgrounds/circuit-horizon.png",
    soulbound: false,
  },
  {
    templateId: 202,
    kind: "background",
    name: "Server Cathedral",
    image: "/assets/backgrounds/server-cathedral.png",
    soulbound: false,
  },
  {
    templateId: 203,
    kind: "background",
    name: "The Void Network",
    image: "/assets/backgrounds/the-void-network.png",
    soulbound: false,
  },
  {
    templateId: 204,
    kind: "background",
    name: "Hash Storm",
    image: "/assets/backgrounds/hash-storm.png",
    soulbound: false,
  },
  {
    templateId: 205,
    kind: "background",
    name: "The Cold Vault",
    image: "/assets/backgrounds/the-cold-vault.png",
    soulbound: false,
  },
  {
    templateId: 206,
    kind: "background",
    name: "Protocol Rain",
    image: "/assets/backgrounds/protocol-rain.png",
    soulbound: false,
  },
  {
    templateId: 207,
    kind: "background",
    name: "Genesis Crater",
    image: "/assets/backgrounds/genesis-crater.png",
    soulbound: false,
  },
  {
    templateId: 208,
    kind: "background",
    name: "The Rig Room",
    image: "/assets/backgrounds/the-rig-room.png",
    soulbound: false,
  },
  {
    templateId: 209,
    kind: "background",
    name: "Exploit Horizon",
    image: "/assets/backgrounds/exploit-horizon.png",
    soulbound: false,
  },
  {
    templateId: 210,
    kind: "background",
    name: "Deep Protocol Sea",
    image: "/assets/backgrounds/deep-protocol-sea.png",
    soulbound: false,
  },
  {
    templateId: 211,
    kind: "background",
    name: "Firewall Dusk",
    image: "/assets/backgrounds/firewall-dusk.png",
    soulbound: false,
  },
  {
    templateId: 212,
    kind: "background",
    name: "Binary Forest",
    image: "/assets/backgrounds/binary-forest.png",
    soulbound: false,
  },
  {
    templateId: 213,
    kind: "background",
    name: "The Mempool",
    image: "/assets/backgrounds/the-mempool.png",
    soulbound: false,
  },
  {
    templateId: 214,
    kind: "background",
    name: "Overclocked Night",
    image: "/assets/backgrounds/overclocked-night.png",
    soulbound: false,
  },
  {
    templateId: 215,
    kind: "background",
    name: "Notoriety Alley",
    image: "/assets/backgrounds/notoriety-alley.png",
    soulbound: false,
  },
  {
    templateId: 216,
    kind: "background",
    name: "Block Graveyard",
    image: "/assets/backgrounds/block-graveyard.png",
    soulbound: false,
  },
  {
    templateId: 217,
    kind: "background",
    name: "Cold Storage Facility",
    image: "/assets/backgrounds/cold-storage-facility.png",
    soulbound: false,
  },
  {
    templateId: 218,
    kind: "background",
    name: "The Hash Abyss",
    image: "/assets/backgrounds/the-hash-abyss.png",
    soulbound: false,
  },
  {
    templateId: 219,
    kind: "background",
    name: "Syndicate Tower",
    image: "/assets/backgrounds/syndicate-tower.png",
    soulbound: false,
  },
  {
    templateId: 220,
    kind: "background",
    name: "Liquidity Pool",
    image: "/assets/backgrounds/liquidity-pool.png",
    soulbound: false,
  },
  {
    templateId: 221,
    kind: "background",
    name: "Zero Day Sky",
    image: "/assets/backgrounds/zero-day-sky.png",
    soulbound: false,
  },
  {
    templateId: 222,
    kind: "background",
    name: "The Dark Pool Exchange",
    image: "/assets/backgrounds/the-dark-pool-exchange.png",
    soulbound: false,
  },
  {
    templateId: 223,
    kind: "background",
    name: "Proof of Work",
    image: "/assets/backgrounds/proof-of-work.png",
    soulbound: false,
  },
  {
    templateId: 224,
    kind: "background",
    name: "The Final Block",
    image: "/assets/backgrounds/the-final-block.png",
    soulbound: false,
  },
];

// Each category unlocks one cosmetic every 4 levels; the 25th item in every
// category unlocks at level 100, so all current cosmetics are reachable by
// the level cap. The soulbound default (index 0) is granted for free on
// register regardless of this computed value.
function withRequiredLevels(
  sources: CosmeticSource[],
): CosmeticTemplateEntry[] {
  return sources.map((source, index) => ({
    ...source,
    requiredLevel: Math.min((index + 1) * 4, 100),
  }));
}

const avatarEntries = withRequiredLevels(avatarSources);
const bannerEntries = withRequiredLevels(bannerSources);
const backgroundEntries = withRequiredLevels(backgroundSources);

// ─── Gear (item) source data ───────────────────────────────────────────────
// templateId ranges, slot-keyed: asicMiner 1000s, motherboard 2000s,
// powerSupply 3000s, coolingSystem 4000s, networkModule 5000s,
// firmwareChip 6000s. Within each range: x000=common … x004=legendary.

const itemEntries: ItemTemplateEntry[] = [
  {
    templateId: 1000,
    kind: "item",
    name: "Scrapyard ASIC",
    slot: "asicMiner",
    rarity: "common",
    image: "/assets/items/asic-miner-common.png",
  },
  {
    templateId: 1001,
    kind: "item",
    name: "Refurbished ASIC",
    slot: "asicMiner",
    rarity: "uncommon",
    image: "/assets/items/asic-miner-uncommon.png",
  },
  {
    templateId: 1002,
    kind: "item",
    name: "CoreStrike ASIC",
    slot: "asicMiner",
    rarity: "rare",
    image: "/assets/items/asic-miner-rare.png",
  },
  {
    templateId: 1003,
    kind: "item",
    name: "Phantom Core MK-I",
    slot: "asicMiner",
    rarity: "epic",
    image: "/assets/items/asic-miner-epic.png",
  },
  {
    templateId: 1004,
    kind: "item",
    name: "Sovereign Hash Engine",
    slot: "asicMiner",
    rarity: "legendary",
    image: "/assets/items/asic-miner-legendary.png",
  },

  {
    templateId: 2000,
    kind: "item",
    name: "Bare PCB",
    slot: "motherboard",
    rarity: "common",
    image: "/assets/items/motherboard-common.png",
  },
  {
    templateId: 2001,
    kind: "item",
    name: "Budget Baseboard",
    slot: "motherboard",
    rarity: "uncommon",
    image: "/assets/items/motherboard-uncommon.png",
  },
  {
    templateId: 2002,
    kind: "item",
    name: "CrossLink MX",
    slot: "motherboard",
    rarity: "rare",
    image: "/assets/items/motherboard-rare.png",
  },
  {
    templateId: 2003,
    kind: "item",
    name: "Nexus Prime Board",
    slot: "motherboard",
    rarity: "epic",
    image: "/assets/items/motherboard-epic.png",
  },
  {
    templateId: 2004,
    kind: "item",
    name: "OmniCore Ultraboard",
    slot: "motherboard",
    rarity: "legendary",
    image: "/assets/items/motherboard-legendary.png",
  },

  {
    templateId: 3000,
    kind: "item",
    name: "Wall Brick PSU",
    slot: "powerSupply",
    rarity: "common",
    image: "/assets/items/power-supply-common.png",
  },
  {
    templateId: 3001,
    kind: "item",
    name: "Bronze Rail PSU",
    slot: "powerSupply",
    rarity: "uncommon",
    image: "/assets/items/power-supply-uncommon.png",
  },
  {
    templateId: 3002,
    kind: "item",
    name: "Titanium Grid PSU",
    slot: "powerSupply",
    rarity: "rare",
    image: "/assets/items/power-supply-rare.png",
  },
  {
    templateId: 3003,
    kind: "item",
    name: "Surge Sovereign PSU",
    slot: "powerSupply",
    rarity: "epic",
    image: "/assets/items/power-supply-epic.png",
  },
  {
    templateId: 3004,
    kind: "item",
    name: "Infinite Rail Core",
    slot: "powerSupply",
    rarity: "legendary",
    image: "/assets/items/power-supply-legendary.png",
  },

  {
    templateId: 4000,
    kind: "item",
    name: "Box Fan Rig",
    slot: "coolingSystem",
    rarity: "common",
    image: "/assets/items/cooling-system-common.png",
  },
  {
    templateId: 4001,
    kind: "item",
    name: "Dual Heatsink",
    slot: "coolingSystem",
    rarity: "uncommon",
    image: "/assets/items/cooling-system-uncommon.png",
  },
  {
    templateId: 4002,
    kind: "item",
    name: "Liquid Loop Cooler",
    slot: "coolingSystem",
    rarity: "rare",
    image: "/assets/items/cooling-system-rare.png",
  },
  {
    templateId: 4003,
    kind: "item",
    name: "CryoVault Module",
    slot: "coolingSystem",
    rarity: "epic",
    image: "/assets/items/cooling-system-epic.png",
  },
  {
    templateId: 4004,
    kind: "item",
    name: "Absolute Zero Array",
    slot: "coolingSystem",
    rarity: "legendary",
    image: "/assets/items/cooling-system-legendary.png",
  },

  {
    templateId: 5000,
    kind: "item",
    name: "Coax Stub",
    slot: "networkModule",
    rarity: "common",
    image: "/assets/items/network-module-common.png",
  },
  {
    templateId: 5001,
    kind: "item",
    name: "Mesh Adapter",
    slot: "networkModule",
    rarity: "uncommon",
    image: "/assets/items/network-module-uncommon.png",
  },
  {
    templateId: 5002,
    kind: "item",
    name: "Deep Packet NIC",
    slot: "networkModule",
    rarity: "rare",
    image: "/assets/items/network-module-rare.png",
  },
  {
    templateId: 5003,
    kind: "item",
    name: "Ghost Protocol NIC",
    slot: "networkModule",
    rarity: "epic",
    image: "/assets/items/network-module-epic.png",
  },
  {
    templateId: 5004,
    kind: "item",
    name: "Zero-Latency Darknet",
    slot: "networkModule",
    rarity: "legendary",
    image: "/assets/items/network-module-legendary.png",
  },

  {
    templateId: 6000,
    kind: "item",
    name: "Factory ROM",
    slot: "firmwareChip",
    rarity: "common",
    image: "/assets/items/firmware-chip-common.png",
  },
  {
    templateId: 6001,
    kind: "item",
    name: "Patched BIOS",
    slot: "firmwareChip",
    rarity: "uncommon",
    image: "/assets/items/firmware-chip-uncommon.png",
  },
  {
    templateId: 6002,
    kind: "item",
    name: "Exploit Microcode",
    slot: "firmwareChip",
    rarity: "rare",
    image: "/assets/items/firmware-chip-rare.png",
  },
  {
    templateId: 6003,
    kind: "item",
    name: "Phantom Kernel v2",
    slot: "firmwareChip",
    rarity: "epic",
    image: "/assets/items/firmware-chip-epic.png",
  },
  {
    templateId: 6004,
    kind: "item",
    name: "Sovereign Override",
    slot: "firmwareChip",
    rarity: "legendary",
    image: "/assets/items/firmware-chip-legendary.png",
  },
];

// ─── Combined catalog ───────────────────────────────────────────────────────

const allEntries: TemplateEntry[] = [
  ...avatarEntries,
  ...bannerEntries,
  ...backgroundEntries,
  ...itemEntries,
];

export const TEMPLATES: ReadonlyMap<number, TemplateEntry> = new Map(
  allEntries.map((entry) => [entry.templateId, entry]),
);

export const DEFAULT_AVATAR_TEMPLATE_ID = 0;
export const DEFAULT_BANNER_TEMPLATE_ID = 100;
export const DEFAULT_BACKGROUND_TEMPLATE_ID = 200;

// ─── Lookup helpers ─────────────────────────────────────────────────────────

export function getTemplate(templateId: number): TemplateEntry | undefined {
  return TEMPLATES.get(templateId);
}

export function getTemplatesByKind(kind: CosmeticKind): CosmeticTemplateEntry[];
export function getTemplatesByKind(kind: "item"): ItemTemplateEntry[];
export function getTemplatesByKind(kind: TemplateKind): TemplateEntry[] {
  return allEntries.filter((entry) => entry.kind === kind);
}

export function getItemTemplateBySlotRarity(
  slot: SlotKey,
  rarity: Rarity,
): ItemTemplateEntry {
  const entry = itemEntries.find((e) => e.slot === slot && e.rarity === rarity);
  if (!entry)
    throw new Error(
      `No item template found for slot="${slot}" rarity="${rarity}"`,
    );
  return entry;
}

function getCosmeticByTemplateId(
  kind: CosmeticKind,
  templateId: number,
): CosmeticTemplateEntry | undefined {
  const entry = getTemplate(templateId);
  return entry && entry.kind === kind ? entry : undefined;
}

export function getAvatarByTemplateId(
  templateId: number,
): CosmeticTemplateEntry | undefined {
  return getCosmeticByTemplateId("avatar", templateId);
}

export function getBannerByTemplateId(
  templateId: number,
): CosmeticTemplateEntry | undefined {
  return getCosmeticByTemplateId("banner", templateId);
}

export function getBackgroundByTemplateId(
  templateId: number,
): CosmeticTemplateEntry | undefined {
  return getCosmeticByTemplateId("background", templateId);
}

// ─── Cosmetic unlock helpers ────────────────────────────────────────────────
// Cosmetics have no DB presence at all — "unlocked" is just a pure
// comparison against the player's current level. No ownership row, no
// mint/purchase step, no async call.

/** True if `templateId` is soulbound, or the player's level meets its requiredLevel. */
export function isCosmeticUnlocked(
  playerLevel: number,
  templateId: number,
): boolean {
  const entry = getTemplate(templateId);
  if (!entry || entry.kind === "item") return false;
  return entry.soulbound || playerLevel >= entry.requiredLevel;
}

// ─── Sanity checks (run once at module load) ───────────────────────────────

function validateCatalog(): void {
  if (allEntries.length !== TEMPLATES.size) {
    throw new Error("Duplicate templateId detected in the template catalog");
  }
  for (const entry of allEntries) {
    if (entry.kind !== "item") {
      if (
        !Number.isInteger(entry.requiredLevel) ||
        entry.requiredLevel < 1 ||
        entry.requiredLevel > 100
      ) {
        throw new Error(
          `Invalid requiredLevel for template ${entry.templateId}`,
        );
      }
    }
  }
}

validateCatalog();
