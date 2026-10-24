// template/lib/database/mock/store.ts
//
// In-memory backing store for the mock database provider. Module-level
// singleton state, mirroring how a real connection pool is shared across a
// process — tests reset it explicitly via resetFixtureDatabase() instead of
// re-importing the module.
import type { GameEventRecord } from "./game-event-contract";
import { isInventoryItemId } from "@/features/types/game/inventory";
import { isDeepStrictEqual } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseOperationUncertainError } from "@/lib/utils/database/operation.server";
import type { EquipmentRecord, LogRecord, PlayerRecord } from "./types";

export interface FixtureState {
  stacks: Map<
    string,
    import("@/lib/modules/items/server.types").InventoryItemRecord
  >;
  players: Map<string, PlayerRecord>;
  equipments: Map<string, EquipmentRecord>;
  logs: LogRecord[];
  gameStats: Map<string, number>;
  gameEvents: Map<string, GameEventRecord>;
  gameStreamLease: { owner: string; expiresAt: number } | null;
  nextItemId: number;
  nextLogId: number;
}

function createEmptyState(): FixtureState {
  return {
    stacks: new Map(),
    players: new Map(),
    equipments: new Map(),
    logs: [],
    gameStats: new Map(),
    gameEvents: new Map(),
    gameStreamLease: null,
    nextItemId: 1,
    nextLogId: 1,
  };
}

let state: FixtureState = createEmptyState();
const transactionState = new AsyncLocalStorage<FixtureState>();
let transactionTail = Promise.resolve();

export async function fixtureTransaction<T>(
  execute: () => Promise<T>,
): Promise<T> {
  if (transactionState.getStore()) return execute();
  const previous = transactionTail;
  let release!: () => void;
  transactionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const original = structuredClone(state);
    try {
      return await transactionState.run(state, execute);
    } catch (error) {
      // Test-only fixtures mirror direct writes: effects remain after failure.
      if (!isDeepStrictEqual(original, state))
        throw new DatabaseOperationUncertainError(error);
      throw error;
    }
  } finally {
    release();
  }
}

/** The live mock store. Repositories read/write through this. */
export function getFixtureState(): FixtureState {
  return transactionState.getStore() ?? state;
}

/** Clears all mock data. Call between tests to guarantee isolation. */
export function resetFixtureDatabase(): void {
  state = createEmptyState();
}

const DEFAULT_STAT_BLOCK = () => ({
  hashRate: 1,
  hackPower: 1,
  security: 1,
  luck: 1,
  firewall: 1,
  exploit: 1,
});

const EMPTY_EQUIPMENT = () => ({
  asicMiner: null,
  motherboard: null,
  powerSupply: null,
  coolingSystem: null,
  networkModule: null,
  firmwareChip: null,
});

/**
 * Seeds (or overwrites) a player in the mock store. Mirrors the Mongoose
 * schema defaults in lib/modules/players/model.server.ts so mock-provider
 * tests see the same shape a fresh MongoDB document would have.
 */
export function seedFixturePlayer(
  overrides: Partial<PlayerRecord> & { wallet: string },
): PlayerRecord {
  const now = Date.now();
  const player: PlayerRecord = {
    username: overrides.username ?? overrides.wallet,
    registrationTime: now,
    xp: 0,
    level: 1,
    hash: 0,
    sparks: 0,
    vault: 0,
    vaultStaked: 0,
    notoriety: 0,
    statLevels: DEFAULT_STAT_BLOCK(),
    stats: DEFAULT_STAT_BLOCK(),
    lastTickAt: now,
    lastSinkAt: now,
    claimCharges: 5,
    lastClaimRegenAt: now,
    raidCharges: 8,
    lastRaidRegenAt: now,
    lastUpgradeTime: 0,
    raidCooldown: 0,
    milestones: {
      totalClaimed: 0,
      totalMined: 0,
      raids: 0,
      raidWins: 0,
      totalStolen: 0,
      bestHashRate: 1,
    },
    equippedAvatarId: null,
    equippedBannerId: null,
    equippedBackgroundId: null,
    equipment: EMPTY_EQUIPMENT(),
    protectionUntil: 0,
    withdrawnToday: 0,
    withdrawResetAt: 0,
    referredBy: null,
    referralCount: 0,
    referralEarned: 0,
    isRegistered: false,
    registeredAt: null,
    registrationTxId: null,
    version: 0,
    ...overrides,
  };
  const state = getFixtureState();
  const previous = state.players.get(player.wallet);
  const delta =
    (player.isRegistered ? player.statLevels.hashRate : 0) -
    (previous?.isRegistered ? previous.statLevels.hashRate : 0);
  state.gameStats.set(
    "globalMinerate",
    (state.gameStats.get("globalMinerate") ?? 0) + delta,
  );
  state.players.set(player.wallet, player);
  return player;
}

export function seedFixtureInventory(
  wallet: string,
  items: Record<string, number>,
): void {
  for (const [itemId, quantity] of Object.entries(items)) {
    if (
      !isInventoryItemId(itemId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    )
      throw new Error("Invalid fixture inventory");
    getFixtureState().stacks.set(JSON.stringify([wallet, itemId]), {
      wallet,
      itemId,
      quantity,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export function fixtureItemQuantities(wallet: string): Record<string, number> {
  return Object.fromEntries(
    [...getFixtureState().stacks.values()]
      .filter((row) => row.wallet === wallet)
      .map((row) => [row.itemId, row.quantity]),
  );
}
