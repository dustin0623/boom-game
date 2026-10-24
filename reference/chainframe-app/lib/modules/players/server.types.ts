// src/lib/modules/players/types.server.ts
import type { Document, Types } from "mongoose";
import type { StatBlock, SlotKey, StatKey } from "@/features/types/game/types";
import type {
  StatEffect,
  StatEffects,
} from "@/features/types/game/stat-effects";

export interface IMilestones {
  totalClaimed: number;
  totalMined: number;
  raids: number;
  raidWins: number;
  totalStolen: number;
  bestHashRate: number;
}

/**
 * Equipped gear references. Each slot holds the MongoDB _id of the Item document
 * currently equipped in that slot (or null when the slot is empty). Kept in sync
 * server-side on equip / unequip / salvage.
 */
export type IEquipment = Record<SlotKey, Types.ObjectId | null>;

export interface IPlayer extends Document {
  activeRaid?: import("@/features/types/game/raid-settlement").ActiveRaid;
  withdrawalReservations?: {
    key: string;
    amount: number;
    windowEnd: number;
    state: "reserved" | "refunded";
  }[];
  loginNonce?: string;
  loginNonceExpiresAt?: number;
  profileInitialized?: boolean;
  wallet: string; // primary key — Hive username
  username: string; // unique display name
  registrationTime: number;

  xp: number;
  level: number;

  hash: number; // claimed / liquid HASH balance
  sparks: number; // secondary crafting currency
  vault: number; // unclaimed mined HASH
  vaultStaked: number; // HASH staked for Luck / Firewall
  notoriety: number;

  /** Raw purchased levels for each stat. */
  statLevels: StatBlock;

  /**
   * Computed effective stat values (statLevels + item bonuses).
   * Updated on every tick, upgrade, or item equip — read O(1) by the tick server.
   */
  stats: StatBlock;

  lastTickAt: number;
  lastSinkAt: number;

  claimCharges: number;
  lastClaimRegenAt: number;
  raidCharges: number;
  lastRaidRegenAt: number;

  /** Timestamp of the last successful stat upgrade. */
  lastUpgradeTime: number;

  /** Per-raid cooldown expiry timestamp (ms). Raid is locked until Date.now() > raidCooldown. */
  raidCooldown: number;

  milestones: IMilestones;

  /**
   * Equipped cosmetic templateIds (const catalog, features/types/game/templates.ts).
   * Cosmetics are never persisted as owned DB rows — these are just pointers
   * into the static catalog, null when nothing of that kind is equipped.
   */
  equippedAvatarId: number | null;
  equippedBannerId: number | null;
  equippedBackgroundId: number | null;

  /** Equipped gear item references, keyed by hardware slot. */
  equipment: IEquipment;

  protectionUntil: number;
  statEffects?: StatEffects | null;

  /**
   * Notoriety-gated withdrawal tracking.
   * withdrawnToday resets when Date.now() > withdrawResetAt.
   */
  withdrawnToday: number; // HASH withdrawn in the current 24-hour window
  withdrawResetAt: number; // timestamp (ms) when withdrawnToday resets

  /** Referral system */
  referredBy: string | null; // wallet of the player who referred this player
  referralCount: number; // how many players this player has referred
  referralEarned: number; // cumulative HASH earned from referral cuts

  /**
   * One-time on-chain HIVE registration fee gate. Players cannot enter the
   * game until this is true (see docs/GAME_ARCHITECTURE.md).
   */
  isRegistered: boolean;
  registeredAt: number | null; // epoch ms when isRegistered flipped true
  registrationTxId: string | null; // Hive tx id that satisfied registration (audit trail)

  /**
   * Optimistic-lock counter — increments on every write.
   * Reject stale mutations whose version doesn't match the DB value.
   */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerMilestones {
  totalClaimed: number;
  totalMined: number;
  raids: number;
  raidWins: number;
  totalStolen: number;
  bestHashRate: number;
}

export interface PlayerRecord {
  wallet: string;
  username: string;
  registrationTime: number;
  xp: number;
  level: number;
  hash: number;
  sparks: number;
  vault: number;
  vaultStaked: number;
  notoriety: number;
  statLevels: StatBlock;
  stats: StatBlock;
  lastTickAt: number;
  lastSinkAt: number;
  claimCharges: number;
  lastClaimRegenAt: number;
  raidCharges: number;
  lastRaidRegenAt: number;
  lastUpgradeTime: number;
  raidCooldown: number;
  milestones: PlayerMilestones;
  equippedAvatarId: number | null;
  equippedBannerId: number | null;
  equippedBackgroundId: number | null;
  equipment: Record<SlotKey, string | null>;
  protectionUntil: number;
  /** Stat-specific Sabotage / Help, at most one effect per stat. Optional when no effects are active. */
  statEffects?: StatEffects | null;
  withdrawnToday: number;
  withdrawResetAt: number;
  referredBy: string | null;
  referralCount: number;
  referralEarned: number;
  isRegistered: boolean;
  registeredAt: number | null;
  registrationTxId: string | null;
  version: number;
}

export interface TickPatch {
  vault: number;
  stats: StatBlock;
  lastTickAt: number;
  milestones: { totalMined: number; bestHashRate: number };
  version: number;
}

export interface PlayerRepository {
  issueLoginNonce(
    wallet: string,
    nonceHash: string,
    expiresAt: number,
  ): Promise<void>;
  consumeLoginNonce(
    wallet: string,
    nonceHash: string,
    expiresAt: number,
    now: number,
  ): Promise<boolean>;
  listReferred(
    wallet: string,
  ): Promise<
    Array<{ username: string; wallet: string; registrationTime: number }>
  >;
  setCosmetic(
    wallet: string,
    kind: "avatar" | "banner" | "background",
    templateId: number,
  ): Promise<void>;
  reserveRaidCharge(
    wallet: string,
    now: number,
    regenMs: number,
    maxCharges: number,
  ): Promise<{ ok: boolean; raidCharges?: number }>;
  claimRaidDefender(
    wallet: string,
    amount: number,
    now: number,
    protectionUntil: number,
  ): Promise<{ ok: boolean }>;
  creditRaidProceeds(
    wallet: string,
    input: { received: number; capacity: number; xp: number },
  ): Promise<{ ok: boolean; credited: number }>;
  debitRaidRisk(
    wallet: string,
    amount: number,
  ): Promise<{ ok: boolean; deducted: number }>;
  recordClaimChargeRegen(
    wallet: string,
    charges: number,
    at: number,
  ): Promise<void>;
  incrementRaidFields(
    wallet: string,
    fields: Partial<Record<"vault" | "notoriety", number>>,
  ): Promise<void>;
  creditSparks(wallet: string, amount: number): Promise<void>;
  setEquipment(
    wallet: string,
    slot: SlotKey,
    itemId: string | null,
  ): Promise<void>;
  findByWallet(wallet: string): Promise<PlayerRecord | null>;

  /** Looks up a player by wallet, creating an unregistered row if one doesn't exist yet. */
  findOrCreate(wallet: string): Promise<PlayerRecord>;

  /** Atomically debits HASH; fails (ok: false) rather than going negative. */
  debitHash(wallet: string, amount: number): Promise<{ ok: boolean }>;

  /** Credits HASH. Fire-and-forget by convention — callers rarely await the result. */
  creditHash(wallet: string, amount: number): Promise<void>;

  /** Atomically debits SPARKS; fails (ok: false) rather than going negative. */
  debitSparks(wallet: string, amount: number): Promise<{ ok: boolean }>;

  /**
   * Atomically sets a stat Sabotage on the target; fails (ok: false) if the player is missing or
   * that stat already holds an active effect. Other stats are never touched.
   */
  applyStatSabotage(
    wallet: string,
    effect: StatEffect,
  ): Promise<{ ok: boolean }>;

  /**
   * Compare-and-set of one stat effect. Writes `next` only while the stored effect is still
   * the active `expected` one (same applier, time and Help count), so two concurrent Help
   * requests cannot both build on the same read.
   */
  replaceStatEffect(
    wallet: string,
    expected: StatEffect,
    next: StatEffect,
  ): Promise<{ ok: boolean }>;

  /** Atomically removes every stat effect (claim / raid reset) and returns what was cleared. */
  clearStatEffects(wallet: string): Promise<StatEffects>;

  /** Credits cumulative referral earnings for the referring wallet. */
  creditReferralHash(wallet: string, amount: number): Promise<void>;

  /** Marks a HASH sink (e.g. a HIVE-paid shop purchase): resets the idle-decay timer without touching balances. */
  touchSink(wallet: string): Promise<void>;

  /** Atomically transition registration and credit the supplied grant once. */
  markRegistered(
    wallet: string,
    txId: string,
    startingHash: number,
  ): Promise<{ changed: boolean; minerate: number }>;

  /** Persists a `tickPlayer()` result — the only fields a tick is allowed to touch. */
  applyTick(wallet: string, patch: TickPatch): Promise<void>;

  /** Moves the current vault balance into HASH and spends one claim charge. */
  recordClaim(wallet: string, claimed: number): Promise<void>;

  /** Staking HASH into the vault: raises capacity and bumps the version counter. */
  recordStake(wallet: string, amount: number): Promise<void>;

  /** Awards XP without touching any other field. */
  addXp(wallet: string, xp: number): Promise<void>;

  /** Persists a stat-level purchase: new level, recomputed effective stat, XP award. */
  recordStatUpgrade(
    wallet: string,
    stat: StatKey,
    nextLevel: number,
    xpGain: number,
  ): Promise<void>;
}
