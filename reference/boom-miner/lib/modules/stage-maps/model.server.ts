import mongoose, { Schema, Model } from "mongoose";
import type { IStageMap, MapNode } from "./types.server";

export type { IStageMap, MapNode, NodeKind } from "./types.server";

const MapNodeSchema = new Schema<MapNode>(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    kind: { type: String, enum: ["chest", "bush"], required: true },
    rarity: { type: String },
    maxHp: { type: Number, required: true },
    hp: { type: Number, required: true },
    coins: { type: Number, required: true },
    destroyed: { type: Boolean, default: false },
  },
  { _id: false },
);

const StageMapSchema = new Schema<IStageMap>(
  {
    game: { type: Schema.Types.Mixed },
    playerId: { type: String, required: true, unique: true, index: true },
    stage: { type: Number, default: 1 },
    seed: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    nodes: { type: Map, of: MapNodeSchema, default: {} },
  },
  {
    collection: "stage_maps",
    timestamps: true,
  },
);

export const StageMapModel: Model<IStageMap> =
  mongoose.models.StageMap ?? mongoose.model<IStageMap>("StageMap", StageMapSchema);
