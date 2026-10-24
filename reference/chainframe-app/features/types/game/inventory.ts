import { REGISTRATION_STARTER_STARTS_AT, REGISTRATION_STARTER_ENDS_AT, REGISTRATION_STARTER_CHESTS, REGISTRATION_STARTER_SABOTAGE, REGISTRATION_STARTER_HELP, EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import { CONSUMABLE_IDS, CONSUMABLES, isConsumableId } from "./consumables";

export const INVENTORY_ITEM_IDS = [
  EQUIPMENT_CHEST_ID,
  ...CONSUMABLE_IDS,
] as const;
export type InventoryItemId = (typeof INVENTORY_ITEM_IDS)[number];
export type ItemQuantities = Partial<Record<InventoryItemId, number>>;
export const MAX_CHEST_PURCHASE_QUANTITY = 25;

export function describeShopItems(itemId: string, quantity: number): string {
  const name =
    itemId === EQUIPMENT_CHEST_ID
      ? "Equipment Chest"
      : isConsumableId(itemId)
        ? CONSUMABLES[itemId].name
        : itemId;
  return `${quantity} ${name}${quantity !== 1 && (itemId === EQUIPMENT_CHEST_ID || isConsumableId(itemId)) ? "s" : ""}`;
}

export function isInventoryItemId(value: unknown): value is InventoryItemId {
  return (
    typeof value === "string" &&
    (INVENTORY_ITEM_IDS as readonly string[]).includes(value)
  );
}
export function assertItemQuantity(
  itemId: string,
  quantity: number,
): asserts itemId is InventoryItemId {
  if (
    !isInventoryItemId(itemId) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    throw new Error("Invalid inventory item or quantity");
}

export interface StartingItemAward {
  itemId: InventoryItemId;
  quantity: number;
}

/** Window decisions use verified payment time; browser callers use this only for copy. */
export function registrationStarterItems(paymentTime: number): StartingItemAward[] {
  if (!Number.isFinite(paymentTime)) throw new Error("Invalid registration payment time");
  if (paymentTime < REGISTRATION_STARTER_STARTS_AT || paymentTime >= REGISTRATION_STARTER_ENDS_AT) return [];
  return [
    { itemId: EQUIPMENT_CHEST_ID, quantity: REGISTRATION_STARTER_CHESTS },
    { itemId: "sabotage-device", quantity: REGISTRATION_STARTER_SABOTAGE },
    { itemId: "help-kit", quantity: REGISTRATION_STARTER_HELP },
  ];
}

/** Explicitly select known positive awards; never expose nested private grant evidence. */
export function publicStartingItems(value: unknown): StartingItemAward[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { itemId, quantity } = entry as Record<string, unknown>;
    if (!isInventoryItemId(itemId) || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || seen.has(itemId)) return [];
    seen.add(itemId);
    return [{ itemId, quantity }];
  });
}
