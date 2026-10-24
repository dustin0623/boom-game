import { HeroRarity, HeroType, rollHeroAttributes } from "@/features/types/HeroRarity";
import type { GameHero, GameState } from "@/features/game/types";
import { spawnHero } from "@/features/game/simulation";

/** An isolated local instance of the same simulation; it has no persistence or socket. */
export function createDemo(source: GameState): GameState {
  const state = structuredClone(source);
  state.playerId = "demo";
  state.runId = "demo";
  state.mapId = `demo:${source.mapId}`;
  state.heroes = {};
  state.bombs = {};
  state.paused = false;
  state.coins = 0;
  const rarities = [HeroRarity.Common, HeroRarity.Uncommon, HeroRarity.Rare, HeroRarity.Epic];
  for (let i = 0; i < rarities.length; i++) {
    const rarity = rarities[i],
      attrs = rollHeroAttributes(rarity);
    const hero: GameHero = {
      id: `demo-${i}`,
      owner: "demo",
      name: "Demo",
      mintedNumber: i,
      level: 1,
      type: Object.values(HeroType)[i % Object.values(HeroType).length],
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
