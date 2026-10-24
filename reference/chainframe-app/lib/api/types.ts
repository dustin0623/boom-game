export interface ReferralsDto {
  ok: true;
  referralCode: string;
  referralCount: number;
  referralEarned: number;
  referralHiveEarned: number;
  referred: { username: string; wallet: string; joinedAt: number }[];
}

export const LEADERBOARD_WEIGHTS = {
  notoriety: 30,
  mining: 30,
  progression: 40,
} as const;
export interface LeaderboardQuery {
  page: number;
}
export interface LeaderboardEntryDto {
  rank: number;
  username: string;
  avatarTemplateId: number;
  level: number;
  /** Current stored Hash Rate level, for display rather than mining scoring. */
  miningLevel: number;
  notoriety: number;
  xp: number;
  score: number;
  points: Record<keyof typeof LEADERBOARD_WEIGHTS, number>;
}
export interface LeaderboardDto {
  ok: true;
  weights: typeof LEADERBOARD_WEIGHTS;
  asOf: number;
  registeredPlayers: number;
  displayedPlayers: number;
  page: number;
  pageSize: 25;
  pageCount: number;
  entries: LeaderboardEntryDto[];
  self: LeaderboardEntryDto | null;
}

export const GAME_STATS_METRICS = [
  "registrations",
  "claimed",
  "stolen",
  "chests",
  "salvage",
  "stat-upgrades",
  "equipment-upgrades",
  "raids",
  "market-sales",
  "deposits",
  "withdrawals",
] as const;
export type GameStatsMetric = (typeof GAME_STATS_METRICS)[number];
export type GameStatsUnit = "count" | "HASH" | "SPARKS" | "HIVE";
export const GAME_STATS_DEFINITIONS: Record<
  GameStatsMetric,
  {
    label: string;
    series: readonly { label: string; unit: GameStatsUnit }[];
  }
> = {
  registrations: {
    label: "New registrations",
    series: [{ label: "Paid registrations", unit: "count" }],
  },
  claimed: {
    label: "HASH claimed",
    series: [
      { label: "HASH claimed", unit: "HASH" },
      { label: "Claims", unit: "count" },
    ],
  },
  stolen: {
    label: "HASH stolen",
    series: [
      { label: "HASH credited to raiders", unit: "HASH" },
      { label: "Successful raids", unit: "count" },
    ],
  },
  chests: {
    label: "Chests opened",
    series: [{ label: "Equipment Chests", unit: "count" }],
  },
  salvage: {
    label: "Salvage",
    series: [
      { label: "SPARKS earned", unit: "SPARKS" },
      { label: "Items salvaged", unit: "count" },
    ],
  },
  "stat-upgrades": {
    label: "Stat upgrades",
    series: [
      { label: "HASH spent", unit: "HASH" },
      { label: "Levels purchased", unit: "count" },
    ],
  },
  "equipment-upgrades": {
    label: "Equipment upgrades",
    series: [
      { label: "SPARKS spent", unit: "SPARKS" },
      { label: "Levels upgraded", unit: "count" },
    ],
  },
  raids: {
    label: "Raids",
    series: [
      { label: "Completed attempts", unit: "count" },
      { label: "Successful raids", unit: "count" },
    ],
  },
  "market-sales": {
    label: "Marketplace sales",
    series: [
      { label: "Completed purchases", unit: "count" },
      { label: "Trading volume", unit: "HIVE" },
    ],
  },
  deposits: {
    label: "HASH deposited",
    series: [
      { label: "HASH credited", unit: "HASH" },
      { label: "Deposits", unit: "count" },
    ],
  },
  withdrawals: {
    label: "HASH withdrawn",
    series: [
      { label: "HASH paid", unit: "HASH" },
      { label: "Paid withdrawals", unit: "count" },
    ],
  },
};
export interface GameStatsSummaryDto {
  ok: true;
  kind: "summary";
  asOf: number;
  mining: {
    registeredPlayers: number;
    hashPerSecond: number;
    hashPerDay: number;
  };
  totals: Record<GameStatsMetric, number[]>;
}
export interface GameStatsDailyDto {
  ok: true;
  kind: "daily";
  asOf: number;
  metric: GameStatsMetric;
  series: { label: string; unit: GameStatsUnit }[];
  days: 7 | 30 | 90;
  points: { day: string; values: number[] }[];
  totals: number[];
}

export interface PlayerDto {
  /** Resolved equipment-inclusive totals, before effects. */
  stats: import("@/features/types/game/types").StatBlock;
  /** Hive username that owns this account. */
  address: string;
  username: string;
  registrationTime: number;
  xp: number;
  level: number;
  hash: number;
  sparks: number;
  vault: number;
  vaultStaked: number;
  notoriety: number;
  statLevels: {
    hashRate: number;
    hackPower: number;
    security: number;
    luck: number;
    firewall: number;
    exploit: number;
  };
  lastTickAt: number;
  lastSinkAt: number;
  claimCharges: number;
  lastClaimRegenAt: number;
  raidCharges: number;
  lastRaidRegenAt: number;
  milestones: {
    totalClaimed: number;
    totalMined: number;
    raids: number;
    raidWins: number;
    totalStolen: number;
    bestHashRate: number;
  };
  protectionUntil: number;
  /** Owned consumable quantities keyed by consumable id. */
  /** Active Sabotage effects on this player, per stat. Public fields only. */
  statEffects?: import("@/features/types/game/stat-effects").PublicStatEffects;
  referredBy: string | null;
  referralCount: number;
  referralEarned: number;
  /** Notoriety-gated withdrawal tracking. */
  withdrawnToday: number; // HASH withdrawn in the current 24-hour window
  withdrawResetAt: number; // epoch ms when withdrawnToday resets
  /**
   * One-time on-chain HIVE registration fee gate — see
   * docs/GAME_ARCHITECTURE.md. Players cannot enter the game
   * until this is true.
   */
  isRegistered: boolean;
  registeredAt: number | null;
  /**
   * Server-authoritative equipped cosmetics, resolved to numeric template IDs
   * for direct rendering by the client. Each field is the templateId of the
   * equipped asset, or null if nothing of that kind is equipped.
   */
  profile: {
    avatar: number | null;
    banner: number | null;
    background: number | null;
  } | null;
}

export interface EquipmentMarketDto {
  currency: "HIVE";
  price: number;
  listedAt: number;
  isMarket: boolean;
}

export interface EquipmentDto {
  id: string;
  templateId: number;
  owner: string;
  name: string;
  slot: string;
  rarity: string;
  level: number;
  stats: Record<string, number>;
  equipped: boolean;
  salvaged: boolean;
  market: EquipmentMarketDto | null;
  createdAt: number;
  lastTransfer: number;
}

export interface InventoryItemDto {
  itemId: import("@/features/types/game/inventory").InventoryItemId;
  quantity: number;
}

/** Equipment listing DTO for the marketplace. */
export interface MarketListingDto {
  currency: "HIVE";
  /** Item's Mongo _id. */
  refId: string;
  owner: string;
  price: number;
  listedAt: number;
  /** Resolved from the item doc. */
  name: string;
  slot: string | null;
  rarity: string | null;
  level: number | null;
  stats: Record<string, number> | null;
}

export interface ChestResult {
  itemId?: string;
  ok: boolean;
  item?: EquipmentDto;
  error?: string;
}

export interface ShopPricesDto {
  /** Informational network-wide Minerate; not a price input. */
  globalMinerate: number;
  /** Live chest prices keyed by chest key. */
  chests: Record<string, number>;
  /** Confirmed owned chest stacks for this wallet. */
  chestOwned?: Record<string, number>;
  /** Fixed HIVE price of the Equipment Chest. */
  chestHivePrice?: number;
  /** Epoch ms the server calculated the prices. */
  asOf: number;
  /** Informational signed-in player's Minerate; not a price input. */
  playerMinerate?: number;
  /** Shared completed-day emission tier, already included by the price endpoint. */
  emission: {
    yesterday: number;
    pricedAt: number;
    threshold: number;
    excess: number;
  };
  /** Shared consumable unit prices and personal owned counts, keyed by consumable id. */
  consumables?: Record<
    string,
    { price: number; hivePrice?: number; owned: number }
  >;
}

export interface PurchaseConsumableResult {
  ok: boolean;
  itemId?: string;
  quantity?: number;
  /** HASH charged per unit, calculated by the server. */
  unitPrice?: number;
  totalPrice?: number;
  error?: string;
}

export const PERSONAL_HISTORY_CATEGORIES = [
  "all",
  "claims",
  "raids",
  "equipment-minted",
  "salvage",
  "stat-upgrades",
  "equipment-upgrades",
  "social",
  "deposits-withdrawals",
  "staking-registration",
] as const;
export type PersonalHistoryCategory =
  (typeof PERSONAL_HISTORY_CATEGORIES)[number];

export interface LogDto {
  id?: string;
  recordedAt?: number;
  participants?: string[];
  correlationKey?: string;
  _id?: string;
  type: string;
  wallet: string;
  target?: string;
  amount?: number;
  seed?: string;
  txHash?: string;
  error?: string;
  data?: Record<string, unknown>;
  createdAt: number;
}

export type TxType =
  | "withdrawal"
  | "deposit"
  | "market_purchase"
  | "registration"
  | "shop_purchase"
  | "game_action";

export interface PendingTxDto {
  transactionId?: string;
  operationIndex?: number;
  id: string;
  type: TxType;
  status: "pending" | "failed" | "dead" | "reconciliation";
  signature: string;
  amount: number;
  itemId: string | null;
  retryCount: number;
  error: string | null;
  refunded: boolean;
  createdAt: number;
}

export interface SettledTxDto {
  transactionId?: string;
  operationIndex?: number;
  id: string;
  type: TxType;
  txHash: string;
  amount: number;
  /** "failed" marks a dead-lettered attempt that never moved funds of its own. */
  status: "success" | "failed";
  error: string | null;
  processedAt: number;
  metadata: (Record<string, unknown> & { startingItems?: import("@/features/types/game/inventory").StartingItemAward[] }) | null;
}
