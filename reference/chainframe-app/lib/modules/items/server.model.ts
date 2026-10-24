import mongoose, { Schema, type Model } from "mongoose";
import { INVENTORY_ITEM_IDS } from "@/features/types/game/inventory";
import type { IInventoryItem } from "./server.types";

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    wallet: { type: String, required: true },
    itemId: { type: String, enum: INVENTORY_ITEM_IDS, required: true },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
  },
  { collection: "items", timestamps: true },
);
InventoryItemSchema.index({ wallet: 1, itemId: 1 }, { unique: true });
export const InventoryItemModel: Model<IInventoryItem> =
  mongoose.models["InventoryItem"] ??
  mongoose.model<IInventoryItem>("InventoryItem", InventoryItemSchema);
