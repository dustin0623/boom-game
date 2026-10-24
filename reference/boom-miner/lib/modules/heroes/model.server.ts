import mongoose, { Schema, Model } from "mongoose";
import type { IHero, HeroAttributesDoc, HeroMarketDoc } from "./types.server";

export type { IHero } from "./types.server";

const HeroAttributesSchema = new Schema<HeroAttributesDoc>(
  {
    power:      { type: Number, required: true },
    speed:      { type: Number, required: true },
    stamina:    { type: Number, required: true },
    bombNumber: { type: Number, required: true },
    bombRange:  { type: Number, required: true },
  },
  { _id: false },
);

const HeroMarketSchema = new Schema<HeroMarketDoc>(
  {
    listed:  { type: Boolean, default: false },
    price:   { type: Number, default: 0 },
    seller:  { type: String, default: null },
    created: { type: Number, default: 0 },
    sold:    { type: Number, default: 0 },
  },
  { _id: false },
);

const HeroSchema = new Schema<IHero>(
  {
    ownerWallet:   { type: String, required: true, index: true },
    minted_number: { type: Number, required: true, unique: true, index: true },
    name:          { type: String, required: true },
    type:          { type: String, required: true },
    rarity:        { type: String, required: true },
    level:         { type: Number, default: 1 },
    attributes:    { type: HeroAttributesSchema, required: true },
    currentEnergy: { type: Number, required: true },
    maxEnergy:     { type: Number, required: true },
    onMap:         { type: Boolean, default: false },
    market:        { type: HeroMarketSchema, default: () => ({}) },
    /** Unix ms of the last regenHeroEnergy write. Defaults to 0 for legacy docs. */
    lastRegenAt:   { type: Number, default: 0 },
  },
  {
    collection: "heroes",
    timestamps: true,
  },
);

// Index for future marketplace queries.
HeroSchema.index({ "market.listed": 1 });

export const HeroModel: Model<IHero> =
  mongoose.models.Hero ?? mongoose.model<IHero>("Hero", HeroSchema);
