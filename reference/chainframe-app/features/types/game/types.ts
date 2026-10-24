export type StatKey =
  "hashRate" | "hackPower" | "security" | "luck" | "firewall" | "exploit";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type SlotKey =
  | "asicMiner"
  | "motherboard"
  | "powerSupply"
  | "coolingSystem"
  | "networkModule"
  | "firmwareChip";

export type StatBlock = Record<StatKey, number>;
export type StatRoll = Partial<Record<StatKey, number>>;

export interface Equipment {
  id: string;
  name: string;
  slot: SlotKey;
  rarity: Rarity;
  stats: StatRoll;
  level: number;
  equipped: boolean;
  createdAt: number;
}

/** The single purchasable chest. */
export type ChestKey = "equipment";

/** Default soulbound template IDs assigned at player registration. */
export const DEFAULT_PLAYER_COSMETICS = {
  avatar: 0,
  banner: 100,
  background: 200,
} as const;

export interface Rival {
  id: string;
  username: string;
  avatarSeed: string;
  /** Hive account name — links out to a Hive explorer on the player card. */
  address: string;
  /** Profile cosmetic template IDs (numeric) — default to 0/100/200 on registration. */
  avatar: number;
  banner: number;
  background: number;
  level: number;
  claims: number;
  attacks: number;
  hashRate: number;
  /** Estimated unclaimed HASH at the target read time; never authorizes raid settlement. */
  vault: number;
  security: number;
  firewall: number;
  hackPower: number;
  /** Gear the rival has equipped, shown on their player card. */
  equipped: Equipment[];
  raided: boolean;
  lastRaidedAt: number | null;
  /**
   * Public flag: the rival currently has an active Sabotage. Display and gating
   * only; who applied it and with which item is never exposed.
   */
  sabotageActive?: boolean;
  /** Viewer-specific Help restriction; sabotage authors remain private. */
  helpBlockedByOwnSabotage: boolean;
  /** Public per-stat Sabotage strength still in force (0-1). Absent stats are unaffected. */
  activeEffects?: Partial<
    Record<"hashRate" | "hackPower" | "security", number>
  >;
}

export interface ActivityEntry {
  id: string;
  /** Plain-text fallback — used for activity feedback and as the accessible label. */
  message: string;
  kind: "info" | "success" | "danger" | "loot";
  at: number;
  /** Optional rich rendering for `message`: an ordered set of text segments,
   *  e.g. a gear name tinted by its rarity. Falls back to `message` when absent. */
  parts?: { text: string; className?: string }[];
  /** Delivered from another player's action (sabotage, help, raid). These live
   *  only in the local feed, so they are merged into the server-log feed. */
  pvp?: boolean;
}
