// template/lib/database/mock/index.ts
import { createFixtureTransactionHistoryRepository } from "./transaction-history-repository";
import type { FixtureRepositories } from "./types";
import { createFixturePlayerRepository } from "./player-repository";
import { createFixtureEquipmentRepository } from "./equipment-repository";
import { createFixtureInventoryItemRepository } from "./inventory-item-repository";
import { createFixtureLogRepository } from "./log-repository";
import { createFixtureGameStatRepository } from "./game-stat-repository";
import { createFixtureGameEventRepository } from "./game-event-repository";
import { fixtureTransaction } from "./store";

export {
  resetFixtureDatabase,
  seedFixturePlayer,
  getFixtureState,
} from "./store";

export function createFixtureRepositories(): FixtureRepositories {
  return {
    transactions: createFixtureTransactionHistoryRepository(),
    settlements: {
      async enqueueWithdrawal() {
        throw new Error("Treasury settlement is disabled in mock mode");
      },
      async dispatch() {
        throw new Error("Treasury settlement is disabled in mock mode");
      },
    },
    transaction: fixtureTransaction,
    players: createFixturePlayerRepository(),
    equipments: createFixtureEquipmentRepository(),
    items: createFixtureInventoryItemRepository(),
    logs: createFixtureLogRepository(),
    gameStats: createFixtureGameStatRepository(),
    gameEvents: createFixtureGameEventRepository(),
  };
}

let fixtureRepositories: FixtureRepositories | null = null;
export function getFixtureRepositories(): FixtureRepositories {
  return (fixtureRepositories ??= createFixtureRepositories());
}
export function resetFixtureRepositories(): void {
  fixtureRepositories = null;
}

export type {
  FixtureRepositories,
  PlayerRecord,
  EquipmentRecord,
  LogRecord,
  TickPatch,
} from "./types";
