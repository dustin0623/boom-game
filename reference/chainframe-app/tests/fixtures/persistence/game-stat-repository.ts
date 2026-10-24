// template/lib/database/mock/game-stat-repository.ts
import type { GameStatRepository } from "./types";
import { getFixtureState } from "./store";

export function createFixtureGameStatRepository(): GameStatRepository {
  return {
    async increment(key, by = 1) {
      const state = getFixtureState();
      state.gameStats.set(key, (state.gameStats.get(key) ?? 0) + by);
    },
    async get(key) {
      return getFixtureState().gameStats.get(key) ?? null;
    },
    async setMax(key, value) {
      const state = getFixtureState();
      const next = Math.max(state.gameStats.get(key) ?? value, value);
      state.gameStats.set(key, next);
      return next;
    },
  };
}
