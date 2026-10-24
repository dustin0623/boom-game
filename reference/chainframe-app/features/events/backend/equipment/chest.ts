import type { EquipmentRecord } from "@/lib/modules/equipments/server.types";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import {
  CHEST_LADDERS,
  EQUIPMENT_CHEST_ID,
  RARITY_INDEX,
  STAT_KEYS,
} from "@/lib/config/constants/game";
import type {
  ChestKey,
  Rarity,
  SlotKey,
  StatKey,
} from "@/features/types/game/types";

import { getItemTemplateBySlotRarity } from "@/features/types/game/templates";
import { inventoryItemRepository } from "@/lib/modules/items/server.repository";
import { randomItemName } from "@/features/types/game/item-names";
import {
  createSeededRng,
  generateServerSeed,
} from "@/lib/utils/game/rng.server";
import { z } from "zod";
import {
  gameActionNow,
  gameActionSeed,
} from "@/lib/utils/game/execution-context.server";

/** Only the current Equipment Chest is supported. */
export const mintEquipmentInput = z.object({
  chest: z.literal(EQUIPMENT_CHEST_ID),
  seed: z.string().min(1),
});

export type MintEquipmentInput = z.infer<typeof mintEquipmentInput>;

export type MintEquipmentResult = {
  ok: boolean;
  item?: EquipmentRecord;
  error?: string;
};

const SLOT_ORDER: SlotKey[] = [
  "asicMiner",
  "motherboard",
  "powerSupply",
  "coolingSystem",
  "networkModule",
  "firmwareChip",
];

// Each sub-roll gets its own namespaced seed. Reusing the SAME seed string
// for rarity/slot/stats (the previous behaviour) means createSeededRng
// re-derives an identical initial state each time, so the first draw from
// every sub-roll is numerically the same value — entangling rarity, slot,
// and stats instead of rolling them independently like the reference does
// off one continuously-advancing rng.
export function rollRarity(
  chest: ChestKey,
  seed: string,
): Rarity {
  const ladder = CHEST_LADDERS[chest];
  if (!ladder) throw new Error(`Unknown chest: ${String(chest)}`);
  const rng = createSeededRng(`${seed}:rarity`);
  const roll = rng() * 100_000;
  for (const step of ladder) {
    const max = Number.isFinite(step!.max) ? step!.max : 100_000;
    if (roll <= max) return step!.rarity;
  }
  return ladder[ladder.length - 1]!.rarity;
}

export function pickRandomSlot(seed: string): SlotKey {
  const rng = createSeededRng(`${seed}:slot`);
  return SLOT_ORDER[Math.floor(rng() * SLOT_ORDER.length)]!;
}

/** Combat-scale stats are stored on a x10 scale, exactly like the reference. */
const SCALED_STATS: StatKey[] = ["hackPower", "security"];

/** Slots that always guarantee their signature stat as the first roll. */
const SLOT_SIGNATURE_STAT: Partial<Record<SlotKey, StatKey>> = {
  asicMiner: "hashRate",
  networkModule: "hackPower",
  coolingSystem: "security",
};

/**
 * Rarity index used for BOTH the stat count and the stat value scale.
 * Reference (`rollItemAttributes`): epic rolls ONE 50/50 between index 4
 * and 5, and that same roll drives how many attributes land AND how strong
 * they roll — count is never chosen independently from magnitude.
 */
function rollRarityIndex(rarity: Rarity, rng: () => number): number {
  if (rarity === "epic") return rng() < 0.5 ? 4 : 5;
  return RARITY_INDEX[rarity];
}

/**
 * Value formula from the reference game (`rollItemAttributes`): a roll
 * inside [0.1 x rarityIndex, rarityIndex], with combat stats scaled x10.
 */
export function rollStats(
  rarity: Rarity,
  seed: string,
  slot?: SlotKey,
): Record<StatKey, number> {
  const rng = createSeededRng(`${seed}:stats`);
  const index = rollRarityIndex(rarity, rng);
  const count = Math.min(STAT_KEYS.length, index);
  const signature = slot ? SLOT_SIGNATURE_STAT[slot] : undefined;

  const rolled: Record<StatKey, number> = {
    hashRate: 0,
    hackPower: 0,
    security: 0,
    luck: 0,
    firewall: 0,
    exploit: 0,
  };

  const availableKeys = STAT_KEYS.filter((key) => key !== signature);
  const keys: StatKey[] = signature ? [signature] : [];
  for (let i = keys.length; i < count && availableKeys.length > 0; i++) {
    const idx = Math.floor(rng() * availableKeys.length);
    const key = availableKeys.splice(idx, 1)[0];
    if (key) keys.push(key);
  }

  const floor = 0.1 * index;
  for (const key of keys) {
    const roll = rng() * (index - floor) + floor;
    const value = SCALED_STATS.includes(key) ? roll * 10 : roll;
    rolled[key] = Math.round(value * 10) / 10;
  }

  return rolled;
}

/** Consume one owned chest and mint at this action's captured Luck/time/seed. */
export async function openChest(
  wallet: string,
  chest: ChestKey,
  clientSeed: string,
): Promise<MintEquipmentResult> {
  mintEquipmentInput.parse({ chest, seed: clientSeed });
  const player = await playerRepository.findByWallet(wallet);
  if (!player) return { ok: false, error: "Player not found" };
  if ((await inventoryItemRepository.quantity(wallet, chest)) < 1)
    return { ok: false, error: "You do not own this chest" };
  const consumed = await inventoryItemRepository.consume(wallet, chest);
  if (!consumed.ok) return { ok: false, error: "You do not own this chest" };
  // A failed/uncertain mint after consumption is parked by ordered processing.
  const serverSeed = gameActionSeed() ?? generateServerSeed();
  const seed = `${clientSeed}:${serverSeed}`;
  const rarity = rollRarity(chest, seed);
  const slot = pickRandomSlot(seed);
  const stats = rollStats(rarity, seed, slot);
  const { templateId } = getItemTemplateBySlotRarity(slot, rarity);
  const item = await equipmentRepository.insert({
    templateId,
    owner: wallet,
    name: randomItemName(slot, seed),
    slot,
    rarity,
    level: 1,
    stats,
    equipped: false,
    salvaged: false,
    createdAt: gameActionNow(),
    lastTransfer: 0,
  });
  await logRepository.create({
    type: "chest",
    wallet,
    amount: 0,
    seed: clientSeed,
    data: { chest, rarity, slot, itemId: item.id, name: item.name, serverSeed },
  });
  await gameStatsRepository.increment("totalChestsOpened");
  return { ok: true, item };
}
