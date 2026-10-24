import type {
  SlotKey,
  StatBlock,
  StatKey,
  StatRoll,
  Rarity,
} from "@/features/types/game/types";
import type {
  StatEffect,
  StatEffects,
} from "@/features/types/game/stat-effects";

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerMilestones {
  totalClaimed: number;
  totalMined: number;
  raids: number;
  raidWins: number;
  totalStolen: number;
  bestHashRate: number;
}

/** Plain application-level representation of a player — no Document/driver types. */
export interface PlayerRecord {
  loginNonce?: string;
  loginNonceExpiresAt?: number;
  profileInitialized?: boolean;
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
  /** Owned consumable quantities keyed by consumable id. Separate from equipment and the items collection. */
  protectionUntil: number;
  /** Active Sabotage / Help effects; null or absent when none is active. */
  /** Stat-specific Sabotage / Help, at most one effect per stat. Absent on legacy players. */
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

/** Narrow, field-scoped result of a mining tick — see tick-player/action.ts. */
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
    hash: string,
    expiresAt: number,
  ): Promise<void>;
  consumeLoginNonce(
    wallet: string,
    hash: string,
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

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface EquipmentMarketListing {
  price: number;
  listedAt: number;
  isMarket: boolean;
}

export interface EquipmentRecord {
  id: string;
  templateId: number;
  owner: string | null;
  name: string;
  slot: SlotKey;
  rarity: Rarity;
  level: number;
  stats: StatRoll;
  equipped: boolean;
  salvaged: boolean;
  market?: EquipmentMarketListing | null;
  createdAt: number;
  lastTransfer: number;
}

export type EquipmentInsertInput = Omit<EquipmentRecord, "id">;

export interface EquipmentRepository {
  listForSale(
    id: string,
    owner: string,
    price: number,
  ): Promise<{ ok: boolean; error?: string }>;
  cancelListing(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; error?: string }>;
  equip(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
  unequip(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
  salvage(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
  findById(id: string): Promise<EquipmentRecord | null>;
  findByIds(ids: string[]): Promise<EquipmentRecord[]>;
  insert(input: EquipmentInsertInput): Promise<EquipmentRecord>;
  /** Bumps level and rescales rolled stats. Fails (ok: false) if not found/owned. */
  upgrade(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export type LogType =
  | "game_action"
  | "registration"
  | "claim"
  | "vault"
  | "raid"
  | "stat_upgrade"
  | "upgrade"
  | "market"
  | "market_item"
  | "chest"
  | "shop"
  | "sabotage"
  | "help"
  | "referral"
  | "salvage"
  | "deposit"
  | "withdrawal"
  | "error";

export interface CreateLogInput {
  participants?: string[];
  correlationKey?: string;
  type: LogType;
  wallet: string;
  target?: string;
  amount?: number;
  txHash?: string;
  seed?: string;
  data?: Record<string, unknown>;
}

export interface LogRecord extends CreateLogInput {
  recordedAt?: number;
  id: string;
  createdAt: number;
}

export interface LogRepository {
  listMarketHistory(wallet: string, limit: number): Promise<LogRecord[]>;
  listMarketSales(limit: number): Promise<LogRecord[]>;
  listHistory(
    wallet: string,
    options: import("@/lib/utils/logs/history").HistoryOptions,
  ): Promise<import("@/lib/utils/logs/history").LogPage>;
  countSocialActionsSince(wallet: string, since: number): Promise<number>;
  create(input: CreateLogInput): Promise<LogRecord>;
}

// ---------------------------------------------------------------------------
// Game stats
// ---------------------------------------------------------------------------

export interface GameStatRepository {
  /** Atomically increments a named global counter (creates it on first use). */
  increment(key: string, by?: number): Promise<void>;
  /** Reads a counter. Returns null if it has never been written. */
  get(key: string): Promise<number | null>;
  /**
   * Atomically raises a counter to `value` if `value` is higher than what is
   * stored (creates it if missing) and returns the resulting value. Never lowers.
   */
  setMax(key: string, value: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Database provider
// ---------------------------------------------------------------------------

export interface FixtureRepositories {
  items: import("@/lib/modules/items/server.types").InventoryItemRepository;
  transactions: import("./transaction-history-contract").TransactionHistoryRepository;
  settlements: import("./settlement-contract").SettlementRepository;
  /** Executes domain writes and the terminal receipt as one unit of work. */
  transaction<T>(execute: () => Promise<T>): Promise<T>;
  gameEvents: import("./game-event-contract").GameEventRepository;
  players: PlayerRepository;
  equipments: EquipmentRepository;
  logs: LogRepository;
  gameStats: GameStatRepository;
}

export type FixtureRepositoriesName = "mock" | "mongodb";
