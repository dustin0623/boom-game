import { describe, expect, it } from "vitest";
import { createDemoState } from "@/game/demo/demo";
import { stepSimulation } from "./simulation";

describe("demo simulation", () => {
  it("starts with four bombers on the map", () => {
    const s = createDemoState(0);
    expect(Object.values(s.heroes).filter((h) => h.onMap)).toHaveLength(4);
  });
  it("plants bombs as time passes", () => {
    let s = createDemoState(0);
    let bombed = false;
    for (let i = 0; i < 300 && !bombed; i++) {
      s = stepSimulation(s, 100, Date.now()).state;
      bombed = s.bombSerial > 0;
    }
    expect(bombed).toBe(true);
  });
});

describe("hero stamina", () => {
  it("does not recover while working on the map", () => {
    const s = createDemoState(0);
    const hero = Object.values(s.heroes)[0]!;
    hero.energy = 5;
    hero.recoveryAt = 0;
    s.bombs = {};
    stepSimulation(s, 100, 60 * 60 * 1000);
    expect(hero.energy).toBeLessThanOrEqual(5);
    expect(hero.recoveryAt).toBe(60 * 60 * 1000);
  });
  it("recalls a hero immediately at 0 stamina", () => {
    const s = createDemoState(0);
    const hero = Object.values(s.heroes)[0]!;
    hero.energy = 0;
    s.bombs = {};
    stepSimulation(s, 100, Date.now());
    expect(hero.onMap).toBe(false);
  });
});

describe("boxed-in heroes", () => {
  it("still bombs when walled in with nowhere to hide", () => {
    const s = createDemoState(0);
    const [hero, ...others] = Object.values(s.heroes);
    for (const o of others) o!.onMap = false;
    // Fill every open tile with bushes except the hero's own tile.
    for (const n of Object.values(s.nodes)) { n.destroyed = false; n.hp = Math.max(1, n.hp); }
    const at = `${Math.round(hero!.x)},${Math.round(hero!.y)}`;
    for (let y = 1; y < 24; y++) for (let x = 1; x < 40; x++) {
      const k = `${x},${y}`;
      if (k !== at && !s.nodes[k] && !(x % 2 === 0 && y % 2 === 0))
        s.nodes[k] = { x, y, kind: "bush", hp: 1, maxHp: 1, coins: 0, destroyed: false } as never;
    }
    s.nodes["20,20"] = { x: 20, y: 20, kind: "chest", hp: 5, maxHp: 5, coins: 1, destroyed: false } as never;
    let bombed = false;
    for (let i = 0; i < 20 && !bombed; i++) bombed = stepSimulation(s, 100, Date.now()).state.bombSerial > 0;
    expect(bombed).toBe(true);
  });
});
