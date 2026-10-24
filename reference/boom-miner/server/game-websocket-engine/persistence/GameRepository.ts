import { randomUUID } from "node:crypto";
import { StageMapModel } from "@/lib/modules/stage-maps/model.server";
import type { GameCheckpoint, IStageMap } from "@/lib/modules/stage-maps/types.server";
import { generateStageMap, rollSeed } from "@/lib/modules/stage-maps/generate";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import type { IHero } from "@/lib/modules/heroes/types.server";
import { PlayerModel } from "@/lib/modules/players/model.server";
import { maxEnergyFor } from "@/lib/constants/game";
import type { GameHero, GameState, RewardReceipt } from "@/features/game/types";
import type { CommandResult } from "@/features/game/protocol";
import { materializeRecovery, utcDate } from "@/features/game/rules";
import { keyOf, refreshAllowance, spawnHero } from "@/features/game/simulation";
import type { LeaseGrant } from "../authority/WalletAuthority";
import { GameEventModel } from "./events.server";

const RECEIPT_LIMIT = 256;

interface StoredReceipt {
  eventId: string;
  result?: CommandResult;
  fingerprint?: string;
}

interface PlayerGameAggregate {
  state?: GameState;
  lease?: Omit<LeaseGrant, "wallet">;
  receipts?: StoredReceipt[];
}

export class GamePersistenceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export interface CommitInput {
  before: GameState;
  candidate: GameState;
  lease: LeaseGrant;
  eventId: string;
  rewards: RewardReceipt[];
  result?: CommandResult;
  fingerprint?: string;
}
export interface GameStorage {
  load(wallet: string, lease: LeaseGrant): Promise<GameState>;
  commit(input: CommitInput): Promise<GameState>;
  receipt(
    wallet: string,
    eventId: string,
  ): Promise<{ result?: CommandResult; fingerprint?: string } | null>;
}

export function heroFromDocument(h: IHero, saved?: GameCheckpoint["movement"][string]): GameHero {
  const market = h.market ?? {};
  return {
    id: String(h._id),
    name: h.name,
    mintedNumber: h.minted_number,
    owner: h.ownerWallet,
    level: h.level,
    type: h.type,
    rarity: h.rarity ?? "common",
    power: Math.max(1, h.attributes.power),
    speed: h.attributes.speed,
    stamina: h.attributes.stamina,
    bombNumber: h.attributes.bombNumber,
    bombRange: h.attributes.bombRange,
    energy: h.currentEnergy,
    maxEnergy: h.maxEnergy ?? maxEnergyFor(h.attributes.stamina),
    onMap: h.onMap,
    recoveryAt: h.lastRegenAt || new Date(h.updatedAt ?? h.createdAt).getTime() || Date.now(),
    market: {
      listed: market.listed ?? false,
      price: market.price ?? 0,
      seller: market.seller ?? null,
      created: market.created ?? 0,
      sold: market.sold ?? 0,
    },
    x: saved?.x ?? 1,
    y: saved?.y ?? 1,
    path: saved?.path ?? [],
    phase: saved?.phase ?? "searching",
    target: saved?.target ?? null,
  };
}

function leaseFilter(lease: LeaseGrant) {
  return {
    wallet: lease.wallet,
    "game.lease.instanceId": lease.instanceId,
    "game.lease.fencingToken": lease.fencingToken,
    "game.lease.expiresAt": { $gt: new Date() },
  };
}

function savedGame(player: { game?: unknown }): PlayerGameAggregate {
  return (player.game ?? {}) as PlayerGameAggregate;
}

function legacyState(
  wallet: string,
  player: {
    stage?: number;
    coins?: number;
    dailyChestsCleared?: number;
    dailyChestsResetAt?: number;
  },
  map: IStageMap | null,
  heroes: IHero[],
): GameState {
  const seed = map?.seed ?? rollSeed();
  const nodes = map
    ? (map.nodes as unknown as Map<string, GameState["nodes"][string]> | GameState["nodes"])
    : Object.fromEntries(
        generateStageMap(player.stage ?? 1, seed).map((node) => [keyOf(node), node]),
      );
  const saved = map?.game;
  const movement = saved?.movement ?? {};
  return {
    playerId: wallet,
    runId: saved?.runId ?? randomUUID(),
    mapId: saved?.mapId ?? randomUUID(),
    revision: saved?.revision ?? 0,
    time: saved?.time ?? 0,
    random: saved?.random ?? seed,
    bombSerial: saved?.bombSerial ?? 0,
    paused: saved?.paused ?? false,
    stage: map?.stage ?? player.stage ?? 1,
    seed,
    nodes: nodes instanceof Map ? Object.fromEntries(nodes) : structuredClone(nodes),
    heroes: Object.fromEntries(
      heroes.map((hero) => [String(hero._id), heroFromDocument(hero, movement[String(hero._id)])]),
    ),
    bombs: structuredClone(saved?.bombs ?? {}),
    coins: player.coins ?? 0,
    daily: {
      date: utcDate(player.dailyChestsResetAt || Date.now()),
      used: player.dailyChestsCleared ?? 0,
      cap: 0,
    },
  };
}

function mergeRoster(state: GameState, heroes: IHero[]): void {
  const previous = state.heroes;
  state.heroes = Object.fromEntries(
    heroes.map((document) => {
      const id = String(document._id);
      const saved = previous[id];
      const hero = heroFromDocument(document, saved);
      if (saved) {
        hero.energy = saved.energy;
        hero.onMap = saved.onMap;
        hero.recoveryAt = saved.recoveryAt;
        hero.x = saved.x;
        hero.y = saved.y;
        hero.path = saved.path;
        hero.phase = saved.phase;
        hero.target = saved.target;
      }
      if (hero.market.listed) hero.onMap = false;
      return [id, hero];
    }),
  );
  for (const [id, bomb] of Object.entries(state.bombs)) {
    if (!state.heroes[bomb.heroId] || state.heroes[bomb.heroId].market.listed)
      delete state.bombs[id];
  }
}

async function projectHeroes(state: GameState): Promise<void> {
  for (const hero of Object.values(state.heroes)) {
    if (hero.market.listed) continue;
    const result = await HeroModel.updateOne(
      { _id: hero.id, ownerWallet: state.playerId, "market.listed": { $ne: true } },
      {
        $set: {
          currentEnergy: hero.energy,
          onMap: hero.onMap,
          lastRegenAt: hero.recoveryAt,
        },
      },
    );
    if (result.matchedCount !== 1) throw new GamePersistenceError("ROSTER_CHANGED");
  }
}

export class GameRepository implements GameStorage {
  async receipt(playerId: string, eventId: string) {
    const player = await PlayerModel.findOne(
      { wallet: playerId, "game.receipts.eventId": eventId },
      { "game.receipts.$": 1 },
    ).lean<{ game?: { receipts?: StoredReceipt[] } } | null>();
    const stored = player?.game?.receipts?.[0];
    if (stored) return { result: stored.result, fingerprint: stored.fingerprint };

    // Preserve idempotent responses for operations committed before the aggregate migration.
    return GameEventModel.findOne({ playerId, eventId }, { result: 1, fingerprint: 1 }).lean();
  }

  /** Loads legacy stage-map data once, then persists game state in the player document. */
  async load(wallet: string, lease: LeaseGrant): Promise<GameState> {
    const player = await PlayerModel.findOne({ wallet }).lean();
    if (!player) throw new GamePersistenceError("PLAYER_NOT_FOUND");
    const aggregate = savedGame(player);
    let state = aggregate.state;
    const heroes = await HeroModel.find({ ownerWallet: wallet }).lean<IHero[]>();
    if (!state) {
      const map = await StageMapModel.findOne({ playerId: wallet }).lean<IStageMap>();
      state = legacyState(wallet, player, map, heroes);
    } else {
      state = structuredClone(state);
      state.coins = player.coins;
      state.daily = {
        date: utcDate(player.dailyChestsResetAt || Date.now()),
        used: player.dailyChestsCleared ?? 0,
        cap: state.daily.cap,
      };
      mergeRoster(state, heroes);
    }
    materializeRecovery(state, Date.now());
    refreshAllowance(state, Date.now());

    const saved = await PlayerModel.updateOne(leaseFilter(lease), {
      $set: {
        "game.state": state,
        stage: state.stage,
        dailyChestsCleared: state.daily.used,
        dailyChestsResetAt: Date.now(),
      },
    });
    if (saved.matchedCount !== 1) throw new GamePersistenceError("AUTHORITY_LOST");
    await projectHeroes(state);
    return state;
  }

  async commit(input: CommitInput): Promise<GameState> {
    const { before, candidate, lease, eventId, rewards } = input;
    const player = await PlayerModel.findOne({ wallet: before.playerId }).lean();
    if (!player) throw new GamePersistenceError("PLAYER_NOT_FOUND");
    const activeIds = [
      ...new Set([
        ...Object.values(candidate.heroes)
          .filter((hero) => hero.onMap)
          .map((hero) => hero.id),
        ...Object.values(candidate.bombs).map((bomb) => bomb.heroId),
      ]),
    ];
    if (
      activeIds.length &&
      (await HeroModel.countDocuments({
        _id: { $in: activeIds },
        ownerWallet: before.playerId,
        "market.listed": { $ne: true },
      })) !== activeIds.length
    ) {
      throw new GamePersistenceError("ROSTER_CHANGED");
    }

    const now = Date.now();
    const date = utcDate(now);
    const next: GameState = {
      ...candidate,
      revision: before.revision + 1,
      daily: {
        ...candidate.daily,
        date,
        used:
          utcDate(player.dailyChestsResetAt || now) === date ? (player.dailyChestsCleared ?? 0) : 0,
      },
    };
    let earned = 0;
    for (const reward of rewards) {
      const amount =
        next.daily.used < next.daily.cap
          ? (before.nodes[reward.nodeKey]?.coins ?? reward.amount)
          : 0;
      reward.amount = amount;
      if (amount > 0) next.daily.used++;
      earned += amount;
    }
    next.coins = player.coins + earned;
    const receipt: StoredReceipt = {
      eventId,
      ...(input.result ? { result: { ...input.result, revision: next.revision } } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    };
    let matchedCount: number;
    try {
      const updated = await PlayerModel.updateOne(
        {
          ...leaseFilter(lease),
          "game.state.runId": before.runId,
          "game.state.revision": before.revision,
          "game.receipts.eventId": { $ne: eventId },
        },
        {
          $set: {
            "game.state": next,
            stage: next.stage,
            dailyChestsCleared: next.daily.used,
            dailyChestsResetAt: now,
          },
          $inc: { coins: earned },
          $push: { "game.receipts": { $each: [receipt], $slice: -RECEIPT_LIMIT } },
        },
      );
      matchedCount = updated.matchedCount;
    } catch (error) {
      if (await this.receipt(before.playerId, eventId)) return this.load(before.playerId, lease);
      throw error;
    }
    if (matchedCount !== 1) {
      if (await this.receipt(before.playerId, eventId)) return this.load(before.playerId, lease);
      const current = await PlayerModel.findOne(leaseFilter(lease), { _id: 1 }).lean();
      throw new GamePersistenceError(current ? "REVISION_CONFLICT" : "AUTHORITY_LOST");
    }

    const latest = await PlayerModel.findOne({ wallet: before.playerId }, { coins: 1 }).lean();
    if (!latest) throw new GamePersistenceError("PLAYER_NOT_FOUND");
    next.coins = latest.coins;
    try {
      await projectHeroes(next);
    } catch (error) {
      console.error(
        "Game state committed but hero projection failed; reconnect will reconcile it",
        {
          wallet: before.playerId,
          eventId,
          error,
        },
      );
      throw error;
    }
    return next;
  }
}

export async function prepareGameDatabase(): Promise<void> {
  await PlayerModel.createIndexes();
  await StageMapModel.createIndexes();
  await GameEventModel.createIndexes();
}
