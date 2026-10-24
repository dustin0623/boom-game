import { z } from "zod";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { inventoryItemRepository } from "@/lib/modules/items/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import {
  CONSUMABLE_IDS,
  MAX_PURCHASE_QUANTITY,
  type ConsumableId,
} from "@/features/types/game/consumables";
import {
  MAX_CHEST_PURCHASE_QUANTITY,
  assertItemQuantity,
  type InventoryItemId,
} from "@/features/types/game/inventory";
import { EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import {
  getLiveConsumablePrice,
  getLiveEquipmentChestPrice,
} from "@/features/events/backend/shop-pricing/prices.server";
import { acquirePurchaseLock } from "@/lib/utils/game/action-guards.server";
import {
  getShopPurchaseTotal,
  getHashReferralReward,
  shopUnitPriceSchema,
} from "@/lib/utils/game/pricing";
export const purchaseConsumableInput = z.object({
  itemId: z.enum(CONSUMABLE_IDS),
  quantity: z.number().int().min(1).max(MAX_PURCHASE_QUANTITY),
  expectedUnitPrice: shopUnitPriceSchema.optional(),
});
export const purchaseChestInput = z.object({
  itemId: z.literal(EQUIPMENT_CHEST_ID),
  quantity: z.number().int().min(1).max(MAX_CHEST_PURCHASE_QUANTITY).default(1),
  expectedUnitPrice: shopUnitPriceSchema.optional(),
});
export type PurchaseConsumableInput = z.infer<typeof purchaseConsumableInput>;
export type PurchaseConsumableResult = {
  ok: boolean;
  code?: "duplicate_request" | "price_changed";
  itemId?: InventoryItemId;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  error?: string;
};
/** Confirmed stock grants, with purchase evidence kept out of inventory stacks. */
export async function grantPurchasedItems(
  wallet: string,
  itemId: InventoryItemId,
  quantity: number,
  payment: {
    paidWith: "hash" | "hive";
    amountCharged: number;
    unitPrice: number;
    txHash?: string;
    pricedEmission?: number;
  },
): Promise<void> {
  assertItemQuantity(itemId, quantity);
  const player = await playerRepository.findByWallet(wallet);
  if (!player) throw new Error("Player not found");
  const cut = payment.paidWith === "hash"
    ? getHashReferralReward(payment.amountCharged) : 0;
  const referrer = cut > 0 && player.referredBy && player.referredBy !== wallet
    ? await playerRepository.findByWallet(player.referredBy) : null;
  await inventoryItemRepository.grant(wallet, itemId, quantity);
  await logRepository.create({
    type: "shop",
    wallet,
    amount: payment.paidWith === "hash" ? -payment.amountCharged : 0,
    ...(payment.txHash ? { txHash: payment.txHash } : {}),
    data: {
      itemId,
      quantity,
      unitPrice: payment.unitPrice,
      paidWith: payment.paidWith,
      ...(payment.pricedEmission === undefined
        ? {}
        : { pricedEmission: payment.pricedEmission }),
      ...(payment.paidWith === "hive"
        ? { hiveAmount: payment.amountCharged }
        : {}),
    },
  });
  if (cut > 0 && referrer) {
    await playerRepository.creditReferralHash(referrer.wallet, cut);
    await logRepository.create({
      type: "referral",
      wallet: referrer.wallet,
      target: wallet,
      amount: cut,
      data: {
        currency: "HASH",
        source: "shop",
        purchaseBasis: payment.amountCharged,
        itemId,
        quantity,
      },
    });
  }
}
async function purchase(
  wallet: string,
  itemId: InventoryItemId,
  quantity: number,
  unitPrice: number,
  expectedUnitPrice?: number,
  pricedEmission?: number,
): Promise<PurchaseConsumableResult> {
  if (expectedUnitPrice !== undefined && expectedUnitPrice !== unitPrice)
    return {
      ok: false,
      code: "price_changed",
      unitPrice,
      error: "The price changed. Review the new price and try again.",
    };
  const totalPrice = getShopPurchaseTotal(unitPrice, quantity);
  getHashReferralReward(totalPrice);
  if (!(await playerRepository.findByWallet(wallet)))
    return { ok: false, error: "Player not found" };
  if (
    (await inventoryItemRepository.quantity(wallet, itemId)) >
    Number.MAX_SAFE_INTEGER - quantity
  )
    return { ok: false, error: "Inventory quantity exceeds safe range" };
  const debited = await playerRepository.debitHash(wallet, totalPrice);
  if (!debited.ok) return { ok: false, error: "Not enough HASH" };
  // The enclosing ordered operation parks unknown post-debit writes. Never blindly refund a possibly applied grant.
  await grantPurchasedItems(wallet, itemId, quantity, {
    paidWith: "hash",
    amountCharged: totalPrice,
    unitPrice,
    pricedEmission,
  });
  return { ok: true, itemId, quantity, unitPrice, totalPrice };
}
export async function purchaseConsumable(
  wallet: string,
  itemId: ConsumableId,
  quantity: number,
  expectedUnitPrice?: number,
): Promise<PurchaseConsumableResult> {
  const release = acquirePurchaseLock(wallet, itemId);
  if (!release)
    return {
      ok: false,
      code: "duplicate_request",
      error: "A purchase of this item is already in progress",
    };
  try {
    const quote = await getLiveConsumablePrice(itemId);
    return await purchase(
      wallet,
      itemId,
      quantity,
      quote.unitPrice,
      expectedUnitPrice,
      quote.pricedEmission,
    );
  } finally {
    release();
  }
}
export async function purchaseChest(
  wallet: string,
  itemId: typeof EQUIPMENT_CHEST_ID,
  quantity = 1,
  expectedUnitPrice?: number,
): Promise<PurchaseConsumableResult> {
  const input = purchaseChestInput.parse({
    itemId,
    quantity,
    expectedUnitPrice,
  });
  const release = acquirePurchaseLock(wallet, itemId);
  if (!release)
    return {
      ok: false,
      code: "duplicate_request",
      error: "A purchase of this item is already in progress",
    };
  try {
    return await purchase(
      wallet,
      input.itemId,
      input.quantity,
      await getLiveEquipmentChestPrice(),
      input.expectedUnitPrice,
    );
  } finally {
    release();
  }
}
