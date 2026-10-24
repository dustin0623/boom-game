// src/lib/modules/players/model.server.ts
import mongoose, { Schema, type Model } from "mongoose";
import type { IPlayer } from "./server.types";

const StatBlockSchema = new Schema(
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

/** Computed effective stats (statLevels + item bonuses). Updated server-side on tick/upgrade/equip. */
const StatsComputedSchema = new Schema(
  {
    hashRate: { type: Number, default: 1 },
    hackPower: { type: Number, default: 1 },
    security: { type: Number, default: 1 },
    luck: { type: Number, default: 1 },
    firewall: { type: Number, default: 1 },
    exploit: { type: Number, default: 1 },
  },
  { _id: false },
);

/** Equipped gear references — ObjectId pointers into the items collection, one per slot. */
const EquipmentSchema = new Schema(
  {
    asicMiner: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    motherboard: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    powerSupply: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    coolingSystem: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    networkModule: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    firmwareChip: { type: Schema.Types.ObjectId, ref: "Item", default: null },
  },
  { _id: false },
);

const EMPTY_EQUIPMENT = () => ({
  asicMiner: null,
  motherboard: null,
  powerSupply: null,
  coolingSystem: null,
  networkModule: null,
  firmwareChip: null,
});

const MilestonesSchema = new Schema(
  {
    totalClaimed: { type: Number, default: 0 },
    totalMined: { type: Number, default: 0 },
    raids: { type: Number, default: 0 },
    raidWins: { type: Number, default: 0 },
    totalStolen: { type: Number, default: 0 },
    bestHashRate: { type: Number, default: 1 },
  },
  { _id: false },
);

const PlayerSchema = new Schema<IPlayer>(
  {
    activeRaid: { type: Schema.Types.Mixed },
    wallet: { type: String, required: true, unique: true, index: true },
    withdrawalReservations: {
      type: [
        new Schema(
          {
            key: String,
            amount: Number,
            windowEnd: Number,
            state: { type: String, enum: ["reserved", "refunded"] },
          },
          { _id: false },
        ),
      ],
      default: undefined,
      select: false,
    },
    loginNonce: { type: String, select: false },
    loginNonceExpiresAt: { type: Number, select: false },
    profileInitialized: { type: Boolean, default: true },
    username: { type: String, required: true, unique: true, index: true },
    registrationTime: { type: Number, default: () => Date.now() },

    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },

    hash: { type: Number, default: 0 },
    sparks: { type: Number, default: 0 },
    vault: { type: Number, default: 0 },
    vaultStaked: { type: Number, default: 0 },
    notoriety: { type: Number, default: 0 },

    statLevels: {
      type: StatBlockSchema,
      default: () => ({
        hashRate: 1,
        hackPower: 1,
        security: 1,
        luck: 1,
        firewall: 1,
        exploit: 1,
      }),
    },

    /** Computed effective stats (base levels + item bonuses). Updated server-side. */
    stats: {
      type: StatsComputedSchema,
      default: () => ({
        hashRate: 1,
        hackPower: 1,
        security: 1,
        luck: 1,
        firewall: 1,
        exploit: 1,
      }),
    },

    lastTickAt: { type: Number, default: () => Date.now() },
    lastSinkAt: { type: Number, default: () => Date.now() },
    claimCharges: { type: Number, default: 5 },
    lastClaimRegenAt: { type: Number, default: () => Date.now() },
    raidCharges: { type: Number, default: 8 },
    lastRaidRegenAt: { type: Number, default: () => Date.now() },

    /** Timestamp of the last successful stat upgrade (ms). */
    lastUpgradeTime: { type: Number, default: 0 },

    /** Per-raid cooldown expiry (ms). Raids blocked until Date.now() > raidCooldown. */
    raidCooldown: { type: Number, default: 0 },

    milestones: {
      type: MilestonesSchema,
      default: () => ({
        totalClaimed: 0,
        totalMined: 0,
        raids: 0,
        raidWins: 0,
        totalStolen: 0,
        bestHashRate: 1,
      }),
    },

    /** Equipped cosmetic templateIds (const catalog) — null when nothing of that kind is equipped. */
    equippedAvatarId: { type: Number, default: null },
    equippedBannerId: { type: Number, default: null },
    equippedBackgroundId: { type: Number, default: null },

    equipment: { type: EquipmentSchema, default: EMPTY_EQUIPMENT },

    /**
     * Owned consumable counts keyed by consumable id ({ "help-kit": 2 }). Mixed so new
     * catalog entries need no schema change; players without the field read as empty.
     * Never stored in `equipment` or the items collection.
     */

    protectionUntil: { type: Number, default: 0 },

    /**
     * Stat-specific Sabotage / Help keyed by stat ({ hashRate: StatEffect }). Mixed so the
     * guarded writes in repository.server.ts can address `statEffects.<stat>.*` paths.
     * Players without the field read as having no effects; no migration is required.
     */
    statEffects: { type: Schema.Types.Mixed, default: undefined },

    /** Notoriety-gated withdrawal tracking. */
    withdrawnToday: { type: Number, default: 0 }, // HASH withdrawn in the current 24-hour window
    withdrawResetAt: { type: Number, default: 0 }, // epoch ms when withdrawnToday resets

    /** Referral system */
    referredBy: { type: String, default: null }, // wallet of the player who referred this player
    referralCount: { type: Number, default: 0 }, // how many players this player has referred
    referralEarned: { type: Number, default: 0 }, // cumulative HASH earned from referral cuts

    /** One-time on-chain HIVE registration fee gate. */
    isRegistered: { type: Boolean, default: false, index: true },
    registeredAt: { type: Number, default: null },
    registrationTxId: { type: String, default: null },

    /** Optimistic-lock / anti-cheat mutation counter. Increments on every write. */
    version: { type: Number, default: 0 },
  },
  { collection: "players", timestamps: true },
);

export const PlayerModel: Model<IPlayer> =
  (mongoose.models["Player"] as Model<IPlayer>) ??
  mongoose.model<IPlayer>("Player", PlayerSchema);
