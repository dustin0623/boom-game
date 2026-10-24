import mongoose, { Schema, Model } from "mongoose";
import type { IPlayer } from "./types.server";

export type { IPlayer } from "./types.server";

const PlayerSchema = new Schema<IPlayer>(
  {
    wallet: { type: String, required: true, unique: true, index: true },
    username: { type: String },
    registrationTime: { type: Number, required: true },
    /** Starting balance is 0 — topped up manually in the DB. */
    coins: { type: Number, default: 0 },
    /** Current stage, increments when all chests are cleared. */
    stage: { type: Number, default: 1 },
    /** Coins withdrawn in the current UTC day — reset lazily on withdrawal. */
    withdrawnToday: { type: Number, default: 0 },
    /** Unix ms of the last successful withdrawal. */
    lastWithdrawnAt: { type: Number, default: 0 },
    /** Chests cleared today across all sessions — reset lazily at UTC midnight. */
    dailyChestsCleared: { type: Number, default: 0 },
    /** Unix ms of the last lazy reset of dailyChestsCleared. */
    dailyChestsResetAt: { type: Number, default: 0 },
    /** Single-document game aggregate keeps standalone MongoDB writes atomic. */
    game: { type: Schema.Types.Mixed },
  },
  { collection: "players" },
);

export const PlayerModel: Model<IPlayer> =
  mongoose.models.Player ?? mongoose.model<IPlayer>("Player", PlayerSchema);
