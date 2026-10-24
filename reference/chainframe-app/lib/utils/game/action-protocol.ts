import { z } from "zod";
import { CONSUMABLE_IDS } from "@/features/types/game/consumables";
import { EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import { MAX_CHEST_PURCHASE_QUANTITY } from "@/features/types/game/inventory";
import {
  shopUnitPriceSchema,
  hiveAmountSchema,
} from "@/lib/utils/game/pricing";
import type { EquipmentActionKind } from "@/features/types/game/actions";
import type { Equipment } from "@/features/types/game/types";
import { GAME_ACTION_PROTOCOL_VERSION } from "@/lib/chains/modules/hive/client";
import { hiveUsernameSchema } from "@/lib/utils/hive/validation";

/** Game payload contract. Signing authority is verified from the Hive operation. */

const id = z.string().trim().min(1).max(128);
const positiveQuantity = z.number().finite().positive();
const stat = z.enum([
  "hashRate",
  "hackPower",
  "security",
  "luck",
  "firewall",
  "exploit",
]);
const equipmentSlot = z.enum([
  "asicMiner",
  "motherboard",
  "powerSupply",
  "coolingSystem",
  "networkModule",
  "firmwareChip",
]);
const nonce = z.string().trim().min(8).max(128);

export const gameActionMetadataSchemas = {
  claim: z.object({ nonce }).strict(),
  increase_vault: z.object({ amount: positiveQuantity, nonce }).strict(),
  upgrade_stat: z
    .object({ stat, levels: z.number().int().min(1).max(10_000), nonce })
    .strict(),
  upgrade_equipment: z
    .object({
      equipmentId: id,
      levels: z.number().int().min(1).max(100),
      nonce,
    })
    .strict(),
  raid: z.object({ target: hiveUsernameSchema, nonce }).strict(),
  sabotage: z
    .object({
      target: hiveUsernameSchema,
      consumableId: z.enum(CONSUMABLE_IDS),
      stat: z.enum(["hashRate", "hackPower", "security"]),
      nonce,
    })
    .strict(),
  help: z
    .object({
      target: hiveUsernameSchema,
      consumableId: z.enum(CONSUMABLE_IDS),
      stat: z.enum(["hashRate", "hackPower", "security"]),
      nonce,
    })
    .strict(),
  equip: z.object({ equipmentId: id, slot: equipmentSlot, nonce }).strict(),
  unequip: z.object({ equipmentId: id, slot: equipmentSlot, nonce }).strict(),
  salvage_equipment: z.object({ equipmentId: id, nonce }).strict(),
  open_chest: z
    .object({
      itemId: z.literal(EQUIPMENT_CHEST_ID),
      nonce,
    })
    .strict(),
  purchase_chest: z
    .object({
      itemId: z.literal(EQUIPMENT_CHEST_ID),
      quantity: z
        .number()
        .int()
        .min(1)
        .max(MAX_CHEST_PURCHASE_QUANTITY)
        .default(1),
      expectedUnitPrice: shopUnitPriceSchema.optional(),
      nonce,
    })
    .strict(),
  purchase_consumable: z
    .object({
      itemId: z.enum(CONSUMABLE_IDS),
      quantity: z.number().int().min(1).max(100),
      expectedUnitPrice: shopUnitPriceSchema.optional(),
      nonce,
    })
    .strict(),
  market_list: z
    .object({
      itemId: id,
      price: hiveAmountSchema,
      currency: z.literal("HIVE"),
      nonce,
    })
    .strict(),
  market_cancel: z.object({ itemId: id, nonce }).strict(),
  equip_cosmetic: z
    .object({
      kind: z.enum(["avatar", "banner", "background"]),
      templateId: z.number().int().positive(),
      nonce,
    })
    .strict(),
  request_withdrawal: z
    .object({ amount: z.number().int().positive(), nonce })
    .strict(),
} as const;

export const GAME_ACTION_NAMES = Object.keys(gameActionMetadataSchemas) as [
  keyof typeof gameActionMetadataSchemas,
  ...(keyof typeof gameActionMetadataSchemas)[],
];

const actionMetadata = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("purchase_chest"),
      metadata: gameActionMetadataSchemas.purchase_chest,
    })
    .strict(),
  z
    .object({
      action: z.literal("claim"),
      metadata: gameActionMetadataSchemas.claim,
    })
    .strict(),
  z
    .object({
      action: z.literal("increase_vault"),
      metadata: gameActionMetadataSchemas.increase_vault,
    })
    .strict(),
  z
    .object({
      action: z.literal("upgrade_stat"),
      metadata: gameActionMetadataSchemas.upgrade_stat,
    })
    .strict(),
  z
    .object({
      action: z.literal("upgrade_equipment"),
      metadata: gameActionMetadataSchemas.upgrade_equipment,
    })
    .strict(),
  z
    .object({
      action: z.literal("raid"),
      metadata: gameActionMetadataSchemas.raid,
    })
    .strict(),
  z
    .object({
      action: z.literal("sabotage"),
      metadata: gameActionMetadataSchemas.sabotage,
    })
    .strict(),
  z
    .object({
      action: z.literal("help"),
      metadata: gameActionMetadataSchemas.help,
    })
    .strict(),
  z
    .object({
      action: z.literal("equip"),
      metadata: gameActionMetadataSchemas.equip,
    })
    .strict(),
  z
    .object({
      action: z.literal("unequip"),
      metadata: gameActionMetadataSchemas.unequip,
    })
    .strict(),
  z
    .object({
      action: z.literal("salvage_equipment"),
      metadata: gameActionMetadataSchemas.salvage_equipment,
    })
    .strict(),
  z
    .object({
      action: z.literal("open_chest"),
      metadata: gameActionMetadataSchemas.open_chest,
    })
    .strict(),
  z
    .object({
      action: z.literal("purchase_consumable"),
      metadata: gameActionMetadataSchemas.purchase_consumable,
    })
    .strict(),
  z
    .object({
      action: z.literal("market_list"),
      metadata: gameActionMetadataSchemas.market_list,
    })
    .strict(),
  z
    .object({
      action: z.literal("market_cancel"),
      metadata: gameActionMetadataSchemas.market_cancel,
    })
    .strict(),
  z
    .object({
      action: z.literal("equip_cosmetic"),
      metadata: gameActionMetadataSchemas.equip_cosmetic,
    })
    .strict(),
  z
    .object({
      action: z.literal("request_withdrawal"),
      metadata: gameActionMetadataSchemas.request_withdrawal,
    })
    .strict(),
]);

export const gameActionPayloadSchema = z
  .object({
    version: z.literal(GAME_ACTION_PROTOCOL_VERSION),
    action: z.string(),
    metadata: z.unknown(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const parsed = actionMetadata.safeParse({
      action: payload.action,
      metadata: payload.metadata,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({ ...issue, path: ["metadata", ...issue.path] });
    }
  });

export type GameActionPayload = {
  version: typeof GAME_ACTION_PROTOCOL_VERSION;
} & z.infer<typeof actionMetadata>;
export type GameActionName = keyof typeof gameActionMetadataSchemas;
export function gameActionAuthority(action: string): "posting" | "active" {
  return action === "request_withdrawal" ? "active" : "posting";
}

export function buildGameAction<K extends GameActionName>(
  action: K,
  metadata: z.input<(typeof gameActionMetadataSchemas)[K]>,
): {
  version: typeof GAME_ACTION_PROTOCOL_VERSION;
  action: K;
  metadata: z.output<(typeof gameActionMetadataSchemas)[K]>;
} {
  return {
    version: GAME_ACTION_PROTOCOL_VERSION,
    action,
    metadata: gameActionMetadataSchemas[action].parse(metadata) as z.output<
      (typeof gameActionMetadataSchemas)[K]
    >,
  };
}

export const buildClaimAction = (
  metadata: z.input<typeof gameActionMetadataSchemas.claim>,
) => buildGameAction("claim", metadata);
export const buildIncreaseVaultAction = (
  metadata: z.input<typeof gameActionMetadataSchemas.increase_vault>,
) => buildGameAction("increase_vault", metadata);
export const buildUpgradeStatAction = (
  metadata: z.input<typeof gameActionMetadataSchemas.upgrade_stat>,
) => buildGameAction("upgrade_stat", metadata);
export const buildRaidAction = (
  metadata: z.input<typeof gameActionMetadataSchemas.raid>,
) => buildGameAction("raid", metadata);
export const buildSabotageAction = (
  metadata: z.input<typeof gameActionMetadataSchemas.sabotage>,
) => buildGameAction("sabotage", metadata);
export const buildHelpAction = (
  metadata: z.input<typeof gameActionMetadataSchemas.help>,
) => buildGameAction("help", metadata);

/** Pure equipment payload construction, independent of dialogs and wallet state. */
export function buildEquipmentAction(
  kind: EquipmentActionKind,
  item: Pick<Equipment, "id" | "slot">,
  nonce: string,
): GameActionPayload {
  switch (kind) {
    case "equip":
    case "unequip":
      return buildGameAction(kind, {
        equipmentId: item.id,
        slot: item.slot,
        nonce,
      });
    case "upgrade":
      return buildGameAction("upgrade_equipment", {
        equipmentId: item.id,
        levels: 1,
        nonce,
      });
    case "salvage":
      return buildGameAction("salvage_equipment", {
        equipmentId: item.id,
        nonce,
      });
  }
}

export function parseGameActionPayload(input: unknown): GameActionPayload {
  const parsed = gameActionPayloadSchema.parse(input);
  return {
    version: parsed.version,
    ...actionMetadata.parse({
      action: parsed.action,
      metadata: parsed.metadata,
    }),
  };
}
