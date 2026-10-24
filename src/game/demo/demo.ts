import { HeroRarity, HeroType, rollHeroAttributes } from "@/game/data/HeroRarity";
import type { GameHero, GameState } from "@/lib/game/dungeon/types";
import { keyOf, spawnHero } from "@/lib/game/dungeon/simulation";
import { generateStageMap, rollSeed } from "@/lib/game/dungeon/generate";

/** Fresh local board with no persistence; used by demo play until the backend exists. */
export function createDemoState(now: number = Date.now()): GameState {
  const seed = rollSeed();
  return createDemo({
    playerId: "demo",
    runId: "demo",
    mapId: `demo:1:${seed}`,
    stage: 1,
    seed,
    revision: 0,
    time: 0,
    random: seed,
    bombSerial: 0,
    paused: false,
    nodes: Object.fromEntries(generateStageMap(1, seed).map((n) => [keyOf(n), n])),
    heroes: {},
    bombs: {},
    coins: 0,
    daily: { date: new Date(now).toISOString().slice(0, 10), used: 0, cap: 0 },
  });
}

/** An isolated local instance of the same simulation; it has no persistence or socket. */
export function createDemo(source: GameState): GameState {
  const state = structuredClone(source);
  state.playerId = "demo";
  state.runId = "demo";
  state.heroes = {};
  state.bombs = {};
  state.paused = false;
  state.coins = 0;
  const rarities = [HeroRarity.Common, HeroRarity.Uncommon, HeroRarity.Rare, HeroRarity.Epic];
  const types = Object.values(HeroType);
  for (let i = 0; i < rarities.length; i++) {
    const rarity = rarities[i]!;
    const attrs = rollHeroAttributes(rarity);
    const hero: GameHero = {
      id: `demo-${i}`,
      owner: "demo",
      name: "Demo",
      mintedNumber: i,
      level: 1,
      type: types[(i * 3) % types.length]!,
      rarity,
      power: attrs.power,
      speed: attrs.speed,
      stamina: attrs.stamina,
      bombNumber: attrs.bombNum,
      bombRange: attrs.bombRange,
      energy: attrs.energy,
      maxEnergy: attrs.energy,
      onMap: true,
      recoveryAt: Date.now(),
      market: { listed: false, price: 0, seller: null, created: 0, sold: 0 },
      x: 1,
      y: 1,
      phase: "searching",
      path: [],
      target: null,
    };
    state.heroes[hero.id] = hero;
    spawnHero(state, hero);
  }
  return state;
}
