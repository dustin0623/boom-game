import mongoose, { Schema } from "mongoose";
import type { CommandResult } from "@/features/game/protocol";

export interface GameEvent {
  playerId: string;
  eventId: string;
  kind: "operation" | "reward";
  fingerprint?: string;
  result?: CommandResult;
  amount?: number;
  createdAt: Date;
}
const schema = new Schema<GameEvent>(
  {
    playerId: { type: String, required: true },
    eventId: { type: String, required: true },
    kind: { type: String, required: true },
    fingerprint: String,
    result: Schema.Types.Mixed,
    amount: Number,
  },
  { collection: "game_events", timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ playerId: 1, eventId: 1 }, { unique: true });
export const GameEventModel =
  (mongoose.models.GameEvent as mongoose.Model<GameEvent>) ||
  mongoose.model<GameEvent>("GameEvent", schema);
