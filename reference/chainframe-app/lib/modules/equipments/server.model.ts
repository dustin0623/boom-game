// Individual rolled equipment and marketplace reservations.
import mongoose, { Schema, type Model } from "mongoose";
import type { IEquipmentDocument } from "./server.types";

const StatRollSchema = new Schema(
  {
    hashRate: { type: Number, default: 0 },
    hackPower: { type: Number, default: 0 },
    security: { type: Number, default: 0 },
    luck: { type: Number, default: 0 },
    firewall: { type: Number, default: 0 },
    exploit: { type: Number, default: 0 },
  },
  { _id: false },
);

const MarketSchema = new Schema(
  {
    currency: { type: String, enum: ["HIVE"], required: true },
    price: { type: Number, required: true },
    listedAt: { type: Number, required: true },
    isMarket: { type: Boolean, default: true },
  },
  { _id: false },
);

const EquipmentSchema = new Schema<IEquipmentDocument>(
  {
    templateId: { type: Number, required: true, index: true },
    purchaseReservation: {
      type: new Schema(
        {
          key: String,
          buyer: String,
          seller: String,
          currency: { type: String, enum: ["HIVE"], required: true },
          price: Number,
          fee: Number,
          proceeds: Number,
          name: String,
          rarity: String,
          listedAt: Number,
          state: {
            type: String,
            enum: ["reserved", "transferred", "refunded"],
          },
        },
        { _id: false },
      ),
      default: undefined,
    },
    owner: { type: String, default: null, index: true },
    name: { type: String, required: true },
    slot: { type: String, required: true },
    rarity: { type: String, required: true },
    level: { type: Number, default: 1 },
    stats: { type: StatRollSchema, default: () => ({}) },
    equipped: { type: Boolean, default: false },
    salvaged: { type: Boolean, default: false },
    market: { type: MarketSchema, default: null },
    createdAt: { type: Number, default: () => Date.now() },
    lastTransfer: { type: Number, default: 0 },
  },
  { collection: "equipments" },
);

EquipmentSchema.index({ owner: 1, equipped: 1 });
EquipmentSchema.index({ rarity: 1, slot: 1 });
EquipmentSchema.index(
  { "market.isMarket": 1, "market.listedAt": -1 },
  { sparse: true },
);

export const EquipmentModel: Model<IEquipmentDocument> =
  mongoose.models["Equipment"] ??
  mongoose.model<IEquipmentDocument>("Equipment", EquipmentSchema);
