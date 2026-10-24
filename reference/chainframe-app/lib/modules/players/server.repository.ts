// src/lib/modules/players/repository.server.ts
import { gameActionNow } from "@/lib/utils/game/execution-context.server";
import { raidAmount } from "@/features/types/game/exposure";
import { PlayerModel } from "./server.model";
import type {
  IPlayer,
  PlayerRecord,
  PlayerRepository,
  TickPatch,
} from "./server.types";
import { connectDatabase } from "@/lib/config/database";
import { isDeepStrictEqual } from "node:util";
import type {
  ActiveRaid,
  RaidField,
  RaidStep,
} from "@/features/types/game/raid-settlement";
import { RaidEvidenceConflict } from "@/features/types/game/raid-settlement";
import {
  DatabaseOperationUncertainError,
  withDatabaseConditionalWrite,
} from "@/lib/utils/database/operation.server";

const raidFields = new Set<RaidField>([
  "raidCharges",
  "lastRaidRegenAt",
  "claimCharges",
  "lastClaimRegenAt",
  "statEffects",
  "vault",
  "protectionUntil",
  "notoriety",
  "xp",
  "milestones.raids",
  "milestones.raidWins",
  "milestones.totalStolen",
]);

export async function applyRaidStep(
  key: string,
  step: RaidStep,
): Promise<void> {
  await connectDatabase();
  if (
    Object.keys(step.before).some(
      (field) => !raidFields.has(field as RaidField),
    ) ||
    Object.keys(step.after).some((field) => !raidFields.has(field as RaidField))
  )
    throw new RaidEvidenceConflict("Invalid raid field");
  const read = async () =>
    PlayerModel.findOne({ wallet: step.wallet })
      .select({ activeRaid: 1 })
      .lean();
  const before = await read();
  const marker = before?.activeRaid as ActiveRaid | undefined;
  if (marker && (marker.version !== 1 || marker.key !== key))
    throw new RaidEvidenceConflict("Conflicting active raid");
  const existing = marker?.steps.find((value) => value.stage === step.stage);
  if (existing) {
    if (!isDeepStrictEqual(existing, step))
      throw new RaidEvidenceConflict("Conflicting raid effect evidence");
    return;
  }
  const absent = (value: unknown) =>
    isDeepStrictEqual(value, { $raidAbsent: true });
  const expected = Object.fromEntries(
    Object.entries(step.before).map(([field, value]) => [
      field,
      absent(value) ? { $exists: false } : value,
    ]),
  );
  const updates = Object.fromEntries(
    Object.entries(step.after).filter(([, value]) => !absent(value)),
  );
  const removed = Object.fromEntries(
    Object.entries(step.after)
      .filter(([, value]) => absent(value))
      .map(([field]) => [field, ""]),
  );
  const next: ActiveRaid = {
    version: 1,
    key,
    steps: [...(marker?.steps ?? []), step],
  };
  try {
    const result = await PlayerModel.updateOne(
      {
        wallet: step.wallet,
        ...expected,
        activeRaid: marker ?? { $exists: false },
      },
      {
        $set: { ...updates, activeRaid: next },
        ...(Object.keys(removed).length ? { $unset: removed } : {}),
      },
    );
    if (result.matchedCount) return;
  } catch (cause) {
    const saved = (await read())?.activeRaid as ActiveRaid | undefined;
    if (
      saved?.version === 1 &&
      saved.key === key &&
      saved.steps.some((value) => isDeepStrictEqual(value, step))
    )
      return;
    throw new DatabaseOperationUncertainError(cause);
  }
  const saved = (await read())?.activeRaid as ActiveRaid | undefined;
  if (
    saved?.key !== key ||
    !saved.steps.some((value) => isDeepStrictEqual(value, step))
  )
    throw new RaidEvidenceConflict("Raid precondition changed");
}

export async function clearActiveRaid(wallet: string, key: string) {
  await connectDatabase();
  await PlayerModel.updateOne(
    { wallet, "activeRaid.key": key, "activeRaid.version": 1 },
    { $unset: { activeRaid: 1 } },
  );
  if (await readActiveRaid(wallet))
    throw new RaidEvidenceConflict("Conflicting raid cleanup marker");
}

/** Read private markers for an internal evidence review; never part of player DTOs. */
export async function readActiveRaid(
  wallet: string,
): Promise<ActiveRaid | null> {
  await connectDatabase();
  const player = await PlayerModel.findOne({ wallet })
    .select({ activeRaid: 1 })
    .lean();
  if (!player) throw new RaidEvidenceConflict("Missing raid participant");
  return player.activeRaid ?? null;
}
import type { Types } from "mongoose";

/** Ranking inputs only; stable bounded reads, no profile initialization or tick. */
export async function* readLeaderboardPlayerBatches() {
  await connectDatabase();
  let cursor: Types.ObjectId | undefined;
  while (true) {
    const rows = await PlayerModel.find({
      isRegistered: true,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    })
      .select({
        wallet: 1,
        username: 1,
        equippedAvatarId: 1,
        level: 1,
        xp: 1,
        statLevels: 1,
        equipment: 1,
        vaultStaked: 1,
        notoriety: 1,
        lastSinkAt: 1,
        "statEffects.hashRate": 1,
      })
      .sort({ _id: 1 })
      .limit(250)
      .maxTimeMS(5000)
      .lean();
    if (!rows.length) return;
    yield rows.map((row) => ({
      username: row.username,
      equippedAvatarId: row.equippedAvatarId,
      level: row.level,
      xp: row.xp,
      statLevels: { ...row.statLevels },
      wallet: row.wallet,
      equipment: row.equipment,
      vaultStaked: row.vaultStaked,
      notoriety: row.notoriety ?? 0,
      lastSinkAt: row.lastSinkAt,
      statEffects: row.statEffects,
    }));
    cursor = rows[rows.length - 1]._id;
    if (rows.length < 250) return;
  }
}

/** Registered mining inputs only; no tick, inventory read or player mutation. */
export async function* readRegisteredMiningBatches() {
  await connectDatabase();
  let cursor: Types.ObjectId | undefined;
  while (true) {
    const rows = await PlayerModel.find({
      isRegistered: true,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    })
      .select({
        statLevels: 1,
        wallet: 1,
        equipment: 1,
        vaultStaked: 1,
        notoriety: 1,
        lastSinkAt: 1,
        "statEffects.hashRate": 1,
      })
      .sort({ _id: 1 })
      .limit(250)
      .maxTimeMS(5000)
      .lean();
    if (!rows.length) return;
    yield rows.map((row) => ({
      statLevels: { ...row.statLevels },
      wallet: row.wallet,
      equipment: row.equipment,
      vaultStaked: row.vaultStaked,
      notoriety: row.notoriety ?? 0,
      lastSinkAt: row.lastSinkAt,
      statEffects: row.statEffects,
    }));
    cursor = rows[rows.length - 1]._id;
    if (rows.length < 250) return;
  }
}

/** Balance, capacity, and proof of reservation commit in one player write. */
export async function reserveWithdrawal(
  wallet: string,
  key: string,
  amount: number,
  cap: number,
  now: number,
) {
  if (
    !key ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    !Number.isFinite(cap) ||
    cap < 0 ||
    !Number.isFinite(now)
  )
    return { ok: false, error: "Invalid withdrawal" };
  await connectDatabase();
  const existing = await getWithdrawalReservation(wallet, key);
  if (existing) {
    if (existing.amount !== amount)
      throw new Error("Withdrawal reservation intent changed");
    return {
      ok: existing.state === "reserved",
      error: "Withdrawal already refunded",
    };
  }
  const reset = { $lte: [{ $ifNull: ["$withdrawResetAt", 0] }, now] };
  const used = { $cond: [reset, 0, { $ifNull: ["$withdrawnToday", 0] }] };
  const windowEnd = { $cond: [reset, now + 86_400_000, "$withdrawResetAt"] };
  const result = await PlayerModel.updateOne(
    {
      wallet,
      hash: { $gte: amount },
      "withdrawalReservations.key": { $ne: key },
      $expr: { $lte: [{ $add: [used, amount] }, cap] },
    },
    [
      {
        $set: {
          hash: { $subtract: ["$hash", amount] },
          withdrawnToday: { $add: [used, amount] },
          withdrawResetAt: windowEnd,
          withdrawalReservations: {
            $concatArrays: [
              { $ifNull: ["$withdrawalReservations", []] },
              [{ key, amount, windowEnd, state: "reserved" }],
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );
  if (result.modifiedCount) return { ok: true };
  const raced = await getWithdrawalReservation(wallet, key);
  if (raced) {
    if (raced.amount !== amount)
      throw new Error("Withdrawal reservation intent changed");
    return {
      ok: raced.state === "reserved",
      error: "Withdrawal already refunded",
    };
  }
  const player = await PlayerModel.findOne({ wallet }).lean<IPlayer>();
  return {
    ok: false,
    error:
      !player || player.hash < amount
        ? "Insufficient HASH balance"
        : "Daily withdrawal limit reached",
  };
}

export async function getWithdrawalReservation(wallet: string, key: string) {
  await connectDatabase();
  const player = await PlayerModel.findOne({ wallet })
    .select("+withdrawalReservations")
    .lean<IPlayer>();
  return player?.withdrawalReservations?.find((r) => r.key === key);
}

export async function refundWithdrawalReservation(wallet: string, key: string) {
  await connectDatabase();
  const reservation = await getWithdrawalReservation(wallet, key);
  if (!reservation) throw new Error("Missing withdrawal reservation");
  if (reservation.state === "refunded") return;
  await PlayerModel.updateOne(
    {
      wallet,
      withdrawalReservations: {
        $elemMatch: { key, state: "reserved", amount: reservation.amount },
      },
    },
    [
      {
        $set: {
          hash: { $add: ["$hash", reservation.amount] },
          withdrawnToday: {
            $cond: [
              { $eq: ["$withdrawResetAt", reservation.windowEnd] },
              {
                $max: [
                  0,
                  { $subtract: ["$withdrawnToday", reservation.amount] },
                ],
              },
              "$withdrawnToday",
            ],
          },
          withdrawalReservations: {
            $map: {
              input: "$withdrawalReservations",
              as: "r",
              in: {
                $cond: [
                  { $eq: ["$$r.key", key] },
                  { $mergeObjects: ["$$r", { state: "refunded" }] },
                  "$$r",
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  );
}

export async function clearWithdrawalReservation(wallet: string, key: string) {
  await connectDatabase();
  await PlayerModel.updateOne(
    { wallet },
    { $pull: { withdrawalReservations: { key } } },
  );
}
import {
  isStatEffectTarget,
  type StatEffect,
  type StatEffects,
} from "@/features/types/game/stat-effects";

function wasMatched(result: {
  matchedCount?: number;
  modifiedCount?: number;
}): boolean {
  return (result.matchedCount ?? result.modifiedCount ?? 0) > 0;
}

export async function upsertPlayer(input: {
  wallet: string;
  username: string;
  profileInitialized?: boolean;
}) {
  await connectDatabase();
  return PlayerModel.findOneAndUpdate(
    { wallet: input.wallet },
    {
      $setOnInsert: {
        wallet: input.wallet,
        username: input.username,
        registrationTime: gameActionNow(),
        profileInitialized: input.profileInitialized ?? true,
      },
    },
    { upsert: true, new: true },
  );
}

/**
 * Ensures a player row exists for this wallet, creating one (unregistered,
 * with the placeholder username == wallet) on first login. Called right
 * after the Hive Keychain handshake succeeds so the registration gate
 * (docs/GAME_ARCHITECTURE.md) always has a row to flip.
 */
export async function findOrCreatePlayer(wallet: string) {
  return upsertPlayer({ wallet, username: wallet });
}

/**
 * Activates registration and credits its supplied starting HASH atomically.
 * Upserts defensively
 * in case this ever runs before findOrCreatePlayer has created the row.
 */
export async function markPlayerRegistered(
  wallet: string,
  txId: string,
  startingHash: number,
): Promise<{ changed: boolean; minerate: number }> {
  if (!Number.isSafeInteger(startingHash) || startingHash <= 0)
    throw new Error("Invalid registration HASH grant");
  await connectDatabase();
  await findOrCreatePlayer(wallet);
  const player = await PlayerModel.findOneAndUpdate(
    { wallet, isRegistered: { $ne: true } },
    {
      $inc: { hash: startingHash },
      $set: {
        isRegistered: true,
        registeredAt: gameActionNow(),
        registrationTxId: txId,
        lastTickAt: gameActionNow(),
        lastSinkAt: gameActionNow(),
        lastClaimRegenAt: gameActionNow(),
        lastRaidRegenAt: gameActionNow(),
      },
    },
    { new: true },
  );
  return { changed: !!player, minerate: player?.statLevels.hashRate ?? 0 };
}

export async function findPlayerByWallet(wallet: string) {
  await connectDatabase();
  return PlayerModel.findOne({ wallet }).lean<IPlayer>();
}

export async function findPlayerByUsername(username: string) {
  await connectDatabase();
  return PlayerModel.findOne({ username }).lean<IPlayer>();
}

export async function creditHash(
  wallet: string,
  amount: number,
): Promise<void> {
  await connectDatabase();
  await PlayerModel.updateOne({ wallet }, { $inc: { hash: amount } });
}

export async function debitHash(
  wallet: string,
  amount: number,
): Promise<{ ok: boolean }> {
  await connectDatabase();
  const result = await PlayerModel.updateOne(
    { wallet, hash: { $gte: amount } },
    { $inc: { hash: -amount } },
  );
  return { ok: wasMatched(result) };
}

export async function debitSparks(
  wallet: string,
  amount: number,
): Promise<{ ok: boolean }> {
  await connectDatabase();
  const result = await withDatabaseConditionalWrite(() =>
    PlayerModel.updateOne(
      { wallet, sparks: { $gte: amount } },
      { $inc: { sparks: -amount } },
    ).exec(),
  );
  return { ok: wasMatched(result) };
}

/**
 * Atomic guarded set of one stat's Sabotage. The filter requires that stat to have no active
 * effect, so two racers cannot both win, while effects on other stats are left untouched.
 */
export async function applyStatSabotage(
  wallet: string,
  effect: StatEffect,
): Promise<{ ok: boolean }> {
  if (!isStatEffectTarget(effect.stat)) return { ok: false };
  await connectDatabase();
  const path = `statEffects.${effect.stat}`;
  const result = await PlayerModel.updateOne(
    { wallet, [`${path}.active`]: { $ne: true } },
    { $set: { [path]: effect } },
  );
  return { ok: wasMatched(result) };
}

/**
 * Compare-and-set of one stat effect: writes `next` only while the stored effect is still the
 * active `expected` one (same applier, time and Help count). A concurrent Help that already
 * changed the effect makes this a no-op instead of countering the same Sabotage twice.
 */
export async function replaceStatEffect(
  wallet: string,
  expected: StatEffect,
  next: StatEffect,
): Promise<{ ok: boolean }> {
  if (!isStatEffectTarget(expected.stat) || next.stat !== expected.stat)
    return { ok: false };
  await connectDatabase();
  const path = `statEffects.${expected.stat}`;
  const result = await PlayerModel.updateOne(
    {
      wallet,
      [`${path}.active`]: true,
      [`${path}.appliedAt`]: expected.appliedAt,
      [`${path}.appliedBy`]: expected.appliedBy,
      [`${path}.helps`]: { $size: expected.helps.length },
    },
    { $set: { [path]: next } },
  );
  return { ok: wasMatched(result) };
}

/** Atomically unsets every stat effect and returns the pre-image, so a reset is consumed exactly once. */
export async function clearStatEffects(wallet: string): Promise<StatEffects> {
  await connectDatabase();
  const before = await PlayerModel.findOneAndUpdate(
    { wallet, statEffects: { $exists: true } },
    { $unset: { statEffects: "" } },
    { new: false },
  ).lean<IPlayer>();
  return before?.statEffects ? { ...before.statEffects } : {};
}

export async function updatePlayer(
  wallet: string,
  update: Partial<IPlayer> | Record<string, unknown>,
) {
  await connectDatabase();
  const raw = update as Record<string, unknown>;
  const usesOperators = Object.keys(raw).some((key) => key.startsWith("$"));

  if (usesOperators) {
    // Caller passed a Mongo update document ({ $inc, $set, ... }) — pass through.
    return PlayerModel.updateOne({ wallet }, raw);
  }

  // Plain object: strip immutable/internal fields so passing a whole lean
  // document (e.g. from findPlayerByWallet) doesn't fail on _id.
  const {
    _id: _ignoredId,
    __v: _ignoredV,
    wallet: _ignoredWallet,
    createdAt: _ignoredCreatedAt,
    updatedAt: _ignoredUpdatedAt,
    ...safe
  } = raw;

  return PlayerModel.updateOne({ wallet }, { $set: safe });
}

export async function incrementPlayer(
  wallet: string,
  inc: Record<string, number>,
) {
  await connectDatabase();
  return PlayerModel.updateOne({ wallet }, { $inc: inc });
}

/**
 * Atomically regenerates raidCharges up to `now`, then reserves (consumes)
 * exactly one charge if available. This MUST be the only place raidCharges
 * is decremented. Doing the "does the player have a charge?" check and the
 * decrement as two separate steps (e.g. reading the player doc, checking
 * `raidCharges > 0` in application code, then writing back a computed
 * value) lets two concurrent requests from the same wallet both read the
 * same starting count and both pass the check, spending more charges than
 * the player actually had. Regen is applied via an aggregation-pipeline
 * update so it is derived from the document's own current fields at write
 * time rather than a value read moments earlier.
 */
export async function reserveRaidCharge(
  wallet: string,
  now: number,
  regenMs: number,
  maxCharges: number,
): Promise<{ ok: boolean; raidCharges?: number }> {
  await connectDatabase();

  // Mongoose requires updatePipeline for atomic aggregation-pipeline writes.
  // aggregation pipeline (an array), not a plain update document.
  await PlayerModel.updateOne(
    { wallet },
    [
      {
        $set: {
          raidCharges: {
            $min: [
              maxCharges,
              {
                $add: [
                  "$raidCharges",
                  {
                    $floor: {
                      $divide: [
                        { $subtract: [now, "$lastRaidRegenAt"] },
                        regenMs,
                      ],
                    },
                  },
                ],
              },
            ],
          },
          lastRaidRegenAt: {
            $cond: [
              { $gte: [{ $subtract: [now, "$lastRaidRegenAt"] }, regenMs] },
              now,
              "$lastRaidRegenAt",
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );

  // Guarded decrement — identical pattern to debitHash/debitSparks above —
  // only succeeds if raidCharges is still >= 1 at write time.
  const result = await PlayerModel.findOneAndUpdate(
    { wallet, raidCharges: { $gte: 1 } },
    { $inc: { raidCharges: -1 } },
    { new: true },
  ).lean<IPlayer>();

  if (!result) return { ok: false };
  return { ok: true, raidCharges: result.raidCharges };
}

/**
 * Atomically claims a defender for one raid: debits `takenFromVault` and starts
 * their protection window in a single conditional update. The filter requires
 * that protection has lapsed and the vault still holds the amount, so two
 * concurrent raids on the same defender cannot both land or take the same HASH
 * twice — the loser gets `ok: false` and must be treated as blocked.
 *
 * Ordering and compensation (no multi-document transactions here): the
 * defender is debited first, then the attacker is credited with
 * `creditRaidProceeds`. If the credit throws, the route refunds the defender
 * with `$inc`. HASH is therefore never credited before it has been removed.
 */
export async function claimRaidDefender(
  wallet: string,
  takenFromVault: number,
  now: number,
  protectionUntil: number,
): Promise<{ ok: boolean }> {
  await connectDatabase();
  const result = await PlayerModel.updateOne(
    {
      wallet,
      vault: { $gte: takenFromVault },
      $or: [
        { protectionUntil: { $lte: now } },
        { protectionUntil: { $exists: false } },
      ],
    },
    { $inc: { vault: -takenFromVault }, $set: { protectionUntil } },
  );
  return { ok: wasMatched(result) };
}

/**
 * Atomically credits a successful raid to the attacker. The credited amount is
 * derived from the document's own `vault` at write time (capped by free space
 * under `capacity`), and the same expression drives the Notoriety `$inc`, so
 * Notoriety always equals the HASH actually received — never the amount taken
 * from the defender and never a stale-read figure. Returns the pre-image based
 * `credited` amount. Notoriety is never given when `credited` is 0.
 */
export async function creditRaidProceeds(
  wallet: string,
  input: { received: number; capacity: number; xp: number },
): Promise<{ ok: boolean; credited: number }> {
  await connectDatabase();
  const freeSpace = {
    $max: [0, { $subtract: [input.capacity, { $ifNull: ["$vault", 0] }] }],
  };
  const credited = {
    $divide: [
      {
        $floor: {
          $add: [
            {
              $multiply: [
                { $min: [raidAmount(input.received), freeSpace] },
                1_000_000,
              ],
            },
            1e-7,
          ],
        },
      },
      1_000_000,
    ],
  };

  const before = await PlayerModel.findOneAndUpdate(
    { wallet },
    [
      {
        $set: {
          vault: { $add: [{ $ifNull: ["$vault", 0] }, credited] },
          notoriety: { $add: [{ $ifNull: ["$notoriety", 0] }, credited] },
          xp: { $add: [{ $ifNull: ["$xp", 0] }, input.xp] },
          "milestones.raids": {
            $add: [{ $ifNull: ["$milestones.raids", 0] }, 1],
          },
          "milestones.raidWins": {
            $add: [{ $ifNull: ["$milestones.raidWins", 0] }, 1],
          },
          "milestones.totalStolen": {
            $add: [{ $ifNull: ["$milestones.totalStolen", 0] }, credited],
          },
        },
      },
    ],
    { new: false, updatePipeline: true },
  ).lean<IPlayer>();

  if (!before) return { ok: false, credited: 0 };
  const free = Math.max(0, input.capacity - (before.vault ?? 0));
  return {
    ok: true,
    credited: raidAmount(Math.min(raidAmount(input.received), free)),
  };
}

/**
 * D2: burns up to `amount` HASH from the attacker's vault after a failed raid.
 * The deduction is derived from the document's own vault at write time (never
 * below 0) and `deducted` comes from the pre-image, so the defender's Notoriety
 * always equals what was actually removed.
 */
export async function debitRaidRisk(
  wallet: string,
  amount: number,
): Promise<{ ok: boolean; deducted: number }> {
  amount = raidAmount(amount);
  if (!(amount > 0)) return { ok: true, deducted: 0 };
  await connectDatabase();
  const before = await PlayerModel.findOneAndUpdate(
    { wallet },
    [
      {
        $set: {
          vault: {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ["$vault", 0] },
                  {
                    $divide: [
                      {
                        $floor: {
                          $add: [
                            {
                              $multiply: [
                                {
                                  $min: [
                                    amount,
                                    { $max: [0, { $ifNull: ["$vault", 0] }] },
                                  ],
                                },
                                1_000_000,
                              ],
                            },
                            1e-7,
                          ],
                        },
                      },
                      1_000_000,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ],
    { new: false, updatePipeline: true },
  ).lean<IPlayer>();

  if (!before) return { ok: false, deducted: 0 };
  return {
    ok: true,
    deducted: raidAmount(Math.min(amount, Math.max(0, before.vault ?? 0))),
  };
}

/**
 * Returns up to 100 other registered players, including stronger social targets, sorted by vault
 * descending (highest vault first — richest targets at the top).
 */
export async function findRaidTargets(
  _attackerHackPower: number,
  excludeWallet: string,
): Promise<IPlayer[]> {
  await connectDatabase();
  return PlayerModel.find({
    wallet: { $ne: excludeWallet },
    isRegistered: true,
  })
    .sort({ vault: -1 })
    .limit(100)
    .lean<IPlayer[]>();
}

//
// MongoDB-backed implementation of PlayerRepository. All ObjectId handling,
// Mongoose documents, and $inc/$set operators stay inside this file — the
// repository contract and callers never see them.

function toPlayerRecord(doc: IPlayer): PlayerRecord {
  const equipment = doc.equipment as unknown as
    Record<string, unknown> | undefined;
  return {
    wallet: doc.wallet,
    username: doc.username,
    registrationTime: doc.registrationTime,
    xp: doc.xp,
    level: doc.level,
    hash: doc.hash,
    sparks: doc.sparks,
    vault: doc.vault,
    vaultStaked: doc.vaultStaked,
    notoriety: doc.notoriety,
    statLevels: { ...doc.statLevels },
    stats: { ...doc.stats },
    lastTickAt: doc.lastTickAt,
    lastSinkAt: doc.lastSinkAt,
    claimCharges: doc.claimCharges,
    lastClaimRegenAt: doc.lastClaimRegenAt,
    raidCharges: doc.raidCharges,
    lastRaidRegenAt: doc.lastRaidRegenAt,
    lastUpgradeTime: doc.lastUpgradeTime,
    raidCooldown: doc.raidCooldown,
    milestones: { ...doc.milestones },
    equippedAvatarId: doc.equippedAvatarId,
    equippedBannerId: doc.equippedBannerId,
    equippedBackgroundId: doc.equippedBackgroundId,
    equipment: Object.fromEntries(
      Object.entries(equipment ?? {}).map(([slot, value]) => [
        slot,
        value ? String(value) : null,
      ]),
    ) as PlayerRecord["equipment"],
    protectionUntil: doc.protectionUntil,
    statEffects: doc.statEffects
      ? JSON.parse(JSON.stringify(doc.statEffects))
      : null,
    withdrawnToday: doc.withdrawnToday,
    withdrawResetAt: doc.withdrawResetAt,
    referredBy: doc.referredBy,
    referralCount: doc.referralCount,
    referralEarned: doc.referralEarned,
    isRegistered: doc.isRegistered,
    registeredAt: doc.registeredAt,
    registrationTxId: doc.registrationTxId,
    version: doc.version,
  };
}

export const playerRepository: PlayerRepository = {
  issueLoginNonce,
  consumeLoginNonce,
  async listReferred(wallet) {
    await connectDatabase();
    const rows = await PlayerModel.find(
      { referredBy: wallet },
      { username: 1, wallet: 1, registrationTime: 1 },
    ).lean();
    return rows.map((p) => ({
      username: p.username,
      wallet: p.wallet,
      registrationTime: p.registrationTime,
    }));
  },
  async setCosmetic(wallet, kind, templateId) {
    const field = {
      avatar: "equippedAvatarId",
      banner: "equippedBannerId",
      background: "equippedBackgroundId",
    }[kind];
    await updatePlayer(wallet, { $set: { [field]: templateId } });
  },
  reserveRaidCharge,
  claimRaidDefender,
  creditRaidProceeds,
  debitRaidRisk,
  async recordClaimChargeRegen(wallet, charges, at) {
    await updatePlayer(wallet, {
      $set: { claimCharges: charges, lastClaimRegenAt: at },
    });
  },
  async incrementRaidFields(wallet, fields) {
    await incrementPlayer(wallet, fields);
  },
  async creditSparks(wallet, amount) {
    await updatePlayer(wallet, { $inc: { sparks: amount } });
  },
  async setEquipment(wallet, slot, itemId) {
    await updatePlayer(wallet, { $set: { [`equipment.${slot}`]: itemId } });
  },
  async findByWallet(wallet) {
    const player = await findPlayerByWallet(wallet);
    return player ? toPlayerRecord(player) : null;
  },

  async findOrCreate(wallet) {
    const player = await findOrCreatePlayer(wallet);
    return toPlayerRecord(player as unknown as IPlayer);
  },

  async debitHash(wallet, amount) {
    return debitHash(wallet, amount);
  },

  async creditHash(wallet, amount) {
    await creditHash(wallet, amount);
  },

  async debitSparks(wallet, amount) {
    return debitSparks(wallet, amount);
  },

  async applyStatSabotage(wallet, effect) {
    return applyStatSabotage(wallet, effect);
  },

  async replaceStatEffect(wallet, expected, next) {
    return replaceStatEffect(wallet, expected, next);
  },

  async clearStatEffects(wallet) {
    return clearStatEffects(wallet);
  },

  async creditReferralHash(wallet, amount) {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(Math.round(amount * 100)) ||
      amount !== Math.round(amount * 100) / 100
    )
      throw new Error("Invalid referral reward");
    await connectDatabase();
    const result = await PlayerModel.updateOne(
      { wallet },
      { $inc: { hash: amount, referralEarned: amount } },
    );
    if (!result.matchedCount) throw new Error("Referrer not found");
  },

  async touchSink(wallet) {
    await updatePlayer(wallet, {
      $set: { lastSinkAt: gameActionNow() },
    } as unknown as Partial<IPlayer>);
  },

  markRegistered: markPlayerRegistered,

  async applyTick(wallet, patch: TickPatch) {
    await updatePlayer(wallet, {
      $set: {
        vault: patch.vault,
        stats: patch.stats,
        lastTickAt: patch.lastTickAt,
        "milestones.totalMined": patch.milestones.totalMined,
        "milestones.bestHashRate": patch.milestones.bestHashRate,
        version: patch.version,
      },
    } as unknown as Partial<IPlayer>);
  },

  async recordClaim(wallet, claimed) {
    await updatePlayer(wallet, {
      $inc: {
        hash: claimed,
        "milestones.totalClaimed": claimed,
        claimCharges: -1,
      },
      $set: {
        vault: 0,
        lastSinkAt: gameActionNow(),
      },
    } as unknown as Partial<IPlayer>);
  },

  async recordStake(wallet, amount) {
    await updatePlayer(wallet, {
      $inc: { vaultStaked: amount, version: 1 },
      $set: { lastSinkAt: gameActionNow() },
    } as unknown as Partial<IPlayer>);
  },

  async addXp(wallet, xp) {
    await updatePlayer(wallet, {
      $inc: { xp },
    } as unknown as Partial<IPlayer>);
  },

  async recordStatUpgrade(wallet, stat, nextLevel, xpGain) {
    await updatePlayer(wallet, {
      $set: {
        [`statLevels.${stat}`]: nextLevel,
        [`stats.${stat}`]: nextLevel,
        lastSinkAt: gameActionNow(),
        lastUpgradeTime: gameActionNow(),
      },
      $inc: { version: 1, xp: xpGain },
    } as unknown as Partial<IPlayer>);
  },
};

export async function issueLoginNonce(
  wallet: string,
  nonceHash: string,
  expiresAt: number,
): Promise<void> {
  await connectDatabase();
  await PlayerModel.init();
  await PlayerModel.findOneAndUpdate(
    { wallet },
    {
      $set: { loginNonce: nonceHash, loginNonceExpiresAt: expiresAt },
      $setOnInsert: {
        wallet,
        username: wallet,
        profileInitialized: false,
        registrationTime: Date.now(),
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
export async function consumeLoginNonce(
  wallet: string,
  nonceHash: string,
  expiresAt: number,
  now: number,
): Promise<boolean> {
  await connectDatabase();
  const result = await PlayerModel.updateOne(
    {
      wallet,
      loginNonce: nonceHash,
      loginNonceExpiresAt: { $eq: expiresAt, $gt: now },
    },
    { $unset: { loginNonce: 1, loginNonceExpiresAt: 1 } },
  );
  return result.modifiedCount === 1;
}
export async function initializePlayerProfile(
  wallet: string,
): Promise<boolean> {
  await connectDatabase();
  const result = await PlayerModel.updateOne(
    { wallet, profileInitialized: false },
    { $set: { profileInitialized: true } },
  );
  return result.modifiedCount === 1;
}

/** One attribution winner; registered accounts and existing referrals are immutable. */
export async function assignPlayerReferrer(
  wallet: string,
  referrer: string,
): Promise<boolean> {
  if (wallet === referrer) return false;
  await connectDatabase();
  const result = await PlayerModel.updateOne(
    {
      wallet,
      referredBy: null,
      isRegistered: { $ne: true },
      registrationTxId: null,
    },
    { $set: { referredBy: referrer } },
  );
  return result.modifiedCount === 1;
}
