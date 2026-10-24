import { HIVE_WORKER_LEASE_ID, type IGameStat } from "./server.types";
// lib/modules/game-stats/repository.server.ts
import { GameStatModel } from "./server.model";
import { connectDatabase } from "@/lib/config/database";

export async function incrementSettlementStat(
  key: string,
  settlementKey: string,
  amount = 1,
) {
  assertNumericStat(key);
  await connectDatabase();
  try {
    await GameStatModel.updateOne(
      { _id: key },
      { $setOnInsert: { value: 0 } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  await GameStatModel.updateOne(
    { _id: key, settlementKeys: { $ne: settlementKey } },
    {
      $inc: { value: amount },
      $addToSet: { settlementKeys: settlementKey },
      $set: { updatedAt: Date.now() },
    },
  );
}

export async function clearSettlementStat(key: string, settlementKey: string) {
  assertNumericStat(key);
  await connectDatabase();
  await GameStatModel.updateOne(
    { _id: key },
    { $pull: { settlementKeys: settlementKey } },
  );
}

export async function getContractReadiness() {
  await connectDatabase();
  return GameStatModel.findById(HIVE_WORKER_LEASE_ID).lean<IGameStat>();
}

export async function setContractReadiness(
  owner: string,
  ready: boolean,
  checked = false,
) {
  await connectDatabase();
  const result = await GameStatModel.updateOne(
    {
      _id: HIVE_WORKER_LEASE_ID,
      leaseOwner: owner,
      leaseExpiresAt: { $gt: Date.now() },
    },
    {
      $set: {
        workerReady: ready,
        ...(checked ? { lastCheckedAt: Date.now() } : {}),
      },
    },
  );
  if (!result.matchedCount) throw new Error("Smart-contract worker lease lost");
}

/**
 * Atomically increments a stat counter without returning the new value.
 * Use for fire-and-forget stat tracking (e.g. totalRaids, totalHashMined).
 */
export async function incrementStat(key: string, by = 1): Promise<void> {
  assertNumericStat(key);
  await connectDatabase();
  await GameStatModel.updateOne(
    { _id: key },
    { $inc: { value: by }, $set: { updatedAt: Date.now() } },
    { upsert: true },
  );
}

/**
 * Atomically raises a stat to `value` when `value` is higher than what is
 * stored (`$max`), creating it on first use, and returns the resulting value.
 * Idempotent and safe across server instances: it can only ever go up.
 */
export async function setStatMax(key: string, value: number): Promise<number> {
  assertNumericStat(key);
  await connectDatabase();
  const doc = await GameStatModel.findOneAndUpdate(
    { _id: key },
    { $max: { value }, $set: { updatedAt: Date.now() } },
    { upsert: true, new: true },
  );
  return doc!.value;
}

/**
 * Reads a single stat's raw numeric value, or null if it has never been set.
 */
export async function getStat(key: string): Promise<number | null> {
  assertNumericStat(key);
  await connectDatabase();
  const doc = await GameStatModel.findById(key).lean<{
    value: number;
  } | null>();
  return doc ? doc.value : null;
}

import type { GameStatRepository } from "./server.types";

export const gameStatsRepository: GameStatRepository = {
  async increment(key, by = 1) {
    await incrementStat(key, by);
  },
  async get(key) {
    return getStat(key);
  },
  async setMax(key, value) {
    return setStatMax(key, value);
  },
};

function assertNumericStat(key: string) {
  if (key === HIVE_WORKER_LEASE_ID)
    throw new Error(
      "Reserved Hive worker lease cannot be used as a numeric statistic",
    );
}

export const contractStreamRepository = {
  async acquireLease(owner: string, ttlMs: number) {
    await connectDatabase();
    await GameStatModel.init();
    try {
      const result = await GameStatModel.updateOne(
        {
          _id: HIVE_WORKER_LEASE_ID,
          $or: [
            { leaseExpiresAt: { $lte: Date.now() } },
            { leaseOwner: owner },
            { leaseOwner: { $exists: false } },
          ],
        },
        {
          $set: {
            leaseOwner: owner,
            leaseExpiresAt: Date.now() + ttlMs,
            workerReady: false,
          },
        },
        { upsert: true },
      );
      return result.modifiedCount > 0 || result.upsertedCount > 0;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  },
  async renewLease(owner: string, ttlMs: number) {
    await connectDatabase();
    const result = await GameStatModel.updateOne(
      {
        _id: HIVE_WORKER_LEASE_ID,
        leaseOwner: owner,
        leaseExpiresAt: { $gt: Date.now() },
      },
      { $set: { leaseExpiresAt: Date.now() + ttlMs } },
    );
    return result.matchedCount > 0;
  },
  async releaseLease(owner: string) {
    await connectDatabase();
    await GameStatModel.updateOne(
      { _id: HIVE_WORKER_LEASE_ID, leaseOwner: owner },
      {
        $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
        $set: { workerReady: false },
      },
    );
  },
};
