import type { Document } from "mongoose";
import type { InventoryItemId } from "@/features/types/game/inventory";

export interface InventoryItemRecord {
  wallet: string;
  itemId: InventoryItemId;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface IInventoryItem extends InventoryItemRecord, Document {}
export interface InventoryItemRepository {
  listByWallet(wallet: string): Promise<InventoryItemRecord[]>;
  quantity(wallet: string, itemId: InventoryItemId): Promise<number>;
  grant(
    wallet: string,
    itemId: InventoryItemId,
    quantity: number,
  ): Promise<void>;
  consume(wallet: string, itemId: InventoryItemId): Promise<{ ok: boolean }>;
}
