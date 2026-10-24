/**
 * lib/modules/players/types.server.ts
 *
 * Pure TypeScript types for the `players` domain.
 * No mongoose runtime code — only interfaces live here.
 */

import type { Document } from "mongoose";

export interface IPlayer extends Document {
  /** Primary identity — Solana wallet address. Unique + indexed. */
  wallet: string;
  username?: string;
  /** Unix ms at registration time. */
  registrationTime: number;
  /** Authoritative $BMCOIN balance. Starts at 0; topped up manually in DB. */
  coins: number;
  /** Highest/current stage reached. Defaults to 1. */
  stage: number;
  /** Coins withdrawn within the current UTC calendar day (for daily-limit gating). */
  withdrawnToday: number;
  /** Unix ms of the player's last successful withdrawal. */
  lastWithdrawnAt: number;
  /**
   * Total chests destroyed today across all sessions.
   * Reset to 0 at the start of the next UTC day (lazy reset on chest clear).
   * Checked against computeDailyChestCap() before crediting a chest reward.
   */
  dailyChestsCleared: number;
  /** Unix ms when dailyChestsCleared was last reset (used for lazy UTC-day reset). */
  dailyChestsResetAt: number;
  /** Authoritative WebSocket game state and lease, updated atomically with player balance. */
  game?: Record<string, unknown>;
}
