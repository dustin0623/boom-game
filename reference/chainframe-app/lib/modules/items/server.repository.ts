import { connectDatabase } from "@/lib/config/database";
import {
  assertItemQuantity,
  isInventoryItemId,
} from "@/features/types/game/inventory";
import type { InventoryItemId } from "@/features/types/game/inventory";
import { InventoryItemModel } from "./server.model";
import type {
  InventoryItemRecord,
  InventoryItemRepository,
} from "./server.types";

export async function findInventoryItemsByWallet(
  wallet: string,
): Promise<InventoryItemRecord[]> {
  await connectDatabase();
  const records = await InventoryItemModel.find({ wallet }).lean<
    InventoryItemRecord[]
  >();
  if (
    records.some(
      (row) =>
        !isInventoryItemId(row.itemId) ||
        !Number.isSafeInteger(row.quantity) ||
        row.quantity < 0,
    )
  )
    throw new Error("Invalid stored inventory quantity");
  return records;
}
export async function getInventoryQuantity(
  wallet: string,
  itemId: InventoryItemId,
): Promise<number> {
  assertItemQuantity(itemId, 1);
  await connectDatabase();
  const row = await InventoryItemModel.findOne({
    wallet,
    itemId,
  }).lean<InventoryItemRecord>();
  const quantity = row?.quantity ?? 0;
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new Error("Invalid stored inventory quantity");
  return quantity;
}
export async function grantInventoryItems(
  wallet: string,
  itemId: InventoryItemId,
  quantity: number,
): Promise<void> {
  assertItemQuantity(itemId, quantity);
  await connectDatabase();
  const filter = {
    wallet,
    itemId,
    quantity: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - quantity },
  };
  try {
    await InventoryItemModel.findOneAndUpdate(
      filter,
      { $inc: { quantity } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: false },
    );
  } catch (error) {
    // A proven duplicate insert changed nothing: another grant created the same stack,
    // or this stack has no remaining capacity. Never replay unknown write outcomes.
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ))
      throw error;
    const result = await InventoryItemModel.updateOne(filter, {
      $inc: { quantity },
    });
    if (!result.matchedCount)
      throw new Error("Inventory quantity exceeds safe range");
  }
}
export async function consumeInventoryItem(
  wallet: string,
  itemId: InventoryItemId,
): Promise<{ ok: boolean }> {
  assertItemQuantity(itemId, 1);
  await connectDatabase();
  const result = await InventoryItemModel.updateOne(
    { wallet, itemId, quantity: { $gte: 1, $lte: Number.MAX_SAFE_INTEGER } },
    { $inc: { quantity: -1 } },
  );
  return { ok: result.matchedCount === 1 };
}
export const inventoryItemRepository: InventoryItemRepository = {
  listByWallet: findInventoryItemsByWallet,
  quantity: getInventoryQuantity,
  grant: grantInventoryItems,
  consume: consumeInventoryItem,
};
