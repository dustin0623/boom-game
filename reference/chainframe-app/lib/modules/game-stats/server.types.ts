// lib/modules/game-stats/types.server.ts
import type { Document } from "mongoose";

export interface IGameStat extends Omit<Document, "_id"> {
  _id: string; // counter/stat key, e.g. "totalRaids", "totalChestsOpened"
  leaseOwner?: string;
  leaseExpiresAt?: number;
  workerReady?: boolean;
  lastCheckedAt?: number;
  settlementKeys?: string[];
  value: number; // current value
  updatedAt: number; // last write timestamp (ms)
}

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

// Preserve the persisted ID for exclusive leasing across worker versions.
export const HIVE_WORKER_LEASE_ID = "hiveStreamCheckpoint";
