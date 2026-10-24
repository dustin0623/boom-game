import type { GameHero, GameState } from "./types";
export function testHero(overrides: Partial<GameHero> = {}): GameHero {
  return {
    id: "hero-1",
    name: "Hero",
    mintedNumber: 1,
    owner: "player",
    level: 1,
    type: "bomberman",
    rarity: "common",
    power: 3,
    speed: 2,
    stamina: 2,
    bombNumber: 2,
    bombRange: 2,
    energy: 200,
    maxEnergy: 200,
    onMap: true,
    recoveryAt: 0,
    market: { listed: false, price: 0, seller: null, created: 0, sold: 0 },
    x: 1,
    y: 1,
    path: [],
    target: null,
    phase: "searching",
    ...overrides,
  };
}
export function testState(overrides: Partial<GameState> = {}): GameState {
  return {
    playerId: "player",
    runId: "run-test-123",
    mapId: "map-test-123",
    stage: 1,
    seed: 123,
    revision: 0,
    time: 0,
    random: 123,
    bombSerial: 0,
    paused: false,
    nodes: {
      "3,1": { x: 3, y: 1, kind: "chest", hp: 3, maxHp: 3, coins: 800, destroyed: false },
      "9,9": { x: 9, y: 9, kind: "chest", hp: 30, maxHp: 30, coins: 800, destroyed: false },
    },
    heroes: { "hero-1": testHero() },
    bombs: {},
    coins: 0,
    daily: { date: "2026-10-24", used: 0, cap: 12 },
    ...overrides,
  };
}
