import { describe, expect, it } from "vitest";
import {
  advanceStage,
  applyCommand,
  blastTiles,
  simulationCandidate,
  stepSimulation,
} from "./simulation";
import { materializeRecovery } from "./rules";
import { testHero, testState } from "./testing";
const NOW = Date.parse("2026-10-24T12:00:00Z");

describe("authoritative simulation", () => {
  it("is deterministic, independent of rendering, and does not mutate its baseline", () => {
    const original = testState(),
      a = structuredClone(original),
      b = structuredClone(original);
    for (let i = 0; i < 100; i++) {
      stepSimulation(a, 100, NOW + i * 100);
      stepSimulation(b, 100, NOW + i * 100);
    }
    expect(a).toEqual(b);
    const before = testState({
      bombs: { b: { id: "b", heroId: "hero-1", x: 1, y: 1, range: 3, power: 3, dueAt: 0 } },
    });
    const next = simulationCandidate(before);
    stepSimulation(next, 100, NOW);
    expect(before.nodes["3,1"].hp).toBe(3);
    expect(next.nodes["3,1"].destroyed).toBe(true);
  });
  it("stops at walls and at the first destructible", () => {
    const state = testState();
    const tiles = blastTiles(state, { x: 1, y: 1, range: 10 });
    expect(tiles).toContainEqual({ x: 3, y: 1 });
    expect(tiles).not.toContainEqual({ x: 4, y: 1 });
    expect(blastTiles(state, { x: 1, y: 2, range: 5 })).not.toContainEqual({ x: 2, y: 2 });
  });
  it("resolves a bomb once, charges once, and credits its server damage", () => {
    const state = testState({
      bombs: { b: { id: "b", heroId: "hero-1", x: 1, y: 1, range: 3, power: 3, dueAt: 0 } },
    });
    const first = stepSimulation(state, 100, NOW);
    expect(first.rewards).toHaveLength(1);
    expect(state.coins).toBe(800);
    expect(state.heroes["hero-1"].energy).toBe(199);
    stepSimulation(state, 100, NOW);
    expect(state.coins).toBe(800);
    expect(state.heroes["hero-1"].energy).toBe(199);
  });
  it("charges empty blasts and exhausts heroes atomically", () => {
    const state = testState({
      heroes: { "hero-1": testHero({ energy: 1 }) },
      bombs: { b: { id: "b", heroId: "hero-1", x: 35, y: 21, range: 1, power: 3, dueAt: 0 } },
    });
    const result = stepSimulation(state, 100, NOW);
    expect(result.rewards).toEqual([]);
    expect(state.heroes["hero-1"].energy).toBe(0);
    expect(state.heroes["hero-1"].onMap).toBe(false);
  });
  it("does not advance time, fuses, or energy during pause", () => {
    const state = testState({
      paused: true,
      bombs: { b: { id: "b", heroId: "hero-1", x: 1, y: 1, range: 3, power: 3, dueAt: 50 } },
    });
    const before = structuredClone(state);
    stepSimulation(state, 100, NOW + 86400000);
    expect(state).toEqual(before);
  });
  it("keeps recalled bombs, and starts recovery after the last one resolves", () => {
    const state = testState({
      bombs: { b: { id: "b", heroId: "hero-1", x: 1, y: 1, range: 3, power: 3, dueAt: 100 } },
    });
    applyCommand(state, { type: "recall", heroId: "hero-1" }, NOW);
    state.heroes["hero-1"].energy = 100;
    materializeRecovery(state, NOW + 100000);
    expect(state.heroes["hero-1"].energy).toBe(100);
    stepSimulation(state, 100, NOW + 100000);
    expect(state.heroes["hero-1"].energy).toBe(99);
    expect(state.heroes["hero-1"].recoveryAt).toBe(NOW + 100000);
  });
  it("recovers only resting heroes using rarity and fractional elapsed time", () => {
    const state = testState({
      heroes: {
        a: testHero({ id: "a", energy: 0, onMap: false, recoveryAt: NOW }),
        b: testHero({ id: "b", energy: 0, recoveryAt: NOW }),
      },
    });
    materializeRecovery(state, NOW + 150000);
    expect(state.heroes.a.energy).toBeCloseTo(5);
    expect(state.heroes.b.energy).toBe(0);
    expect(applyCommand(state, { type: "deploy", heroId: "a" }, NOW + 150000)).toBe(
      "INSUFFICIENT_ENERGY",
    );
  });
  it("deploys once and enforces ownership, listing, energy and capacity", () => {
    const state = testState({ heroes: { "hero-1": testHero({ onMap: false, recoveryAt: NOW }) } });
    expect(applyCommand(state, { type: "deploy", heroId: "hero-1" }, NOW)).toBeUndefined();
    const point = { x: state.heroes["hero-1"].x, y: state.heroes["hero-1"].y };
    expect(applyCommand(state, { type: "deploy", heroId: "hero-1" }, NOW)).toBeUndefined();
    expect({ x: state.heroes["hero-1"].x, y: state.heroes["hero-1"].y }).toEqual(point);
    state.heroes.other = testHero({ id: "other", owner: "someone-else" });
    expect(applyCommand(state, { type: "recall", heroId: "other" }, NOW)).toBe("HERO_UNAVAILABLE");
    state.heroes.listed = testHero({ id: "listed", market: { listed: true, price: 0, seller: null, created: 0, sold: 0 } });
    expect(applyCommand(state, { type: "deploy", heroId: "listed" }, NOW)).toBe("HERO_UNAVAILABLE");
    state.heroes = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [String(i), testHero({ id: String(i) })]),
    );
    state.heroes.extra = testHero({ id: "extra", onMap: false, recoveryAt: NOW });
    expect(applyCommand(state, { type: "deploy", heroId: "extra" }, NOW)).toBe("MAP_FULL");
  });
  it("reserves energy for outstanding bombs without overspending it", () => {
    const state = testState({
      heroes: { "hero-1": testHero({ energy: 1, bombNumber: 5, target: "3,1" }) },
    });
    stepSimulation(state, 100, NOW);
    expect(Object.keys(state.bombs)).toHaveLength(1);
    state.heroes["hero-1"].path = [];
    state.heroes["hero-1"].target = "3,1";
    stepSimulation(state, 100, NOW);
    expect(Object.keys(state.bombs)).toHaveLength(1);
    expect(state.heroes["hero-1"].energy).toBe(1);
  });
  it("uses remaining allowance in coordinate order, and resets at UTC midnight", () => {
    const state = testState({
      daily: { date: "2026-10-24", used: 11, cap: 12 },
      bombs: { b: { id: "b", heroId: "hero-1", x: 1, y: 1, range: 3, power: 3, dueAt: 0 } },
    });
    state.nodes["1,3"] = { ...state.nodes["3,1"], x: 1, y: 3 };
    const result = stepSimulation(state, 100, NOW);
    expect(result.rewards.map((r) => r.amount)).toEqual([800, 0]);
    expect(state.daily.used).toBe(12);
    stepSimulation(state, 100, NOW + 86400000);
    expect(state.daily.used).toBe(0);
  });
  it("waits for outstanding bombs before advancing and keeps the run and energy", () => {
    const state = testState();
    Object.values(state.nodes).forEach((n) => {
      n.hp = 0;
      n.destroyed = true;
    });
    state.bombs.b = { id: "b", heroId: "hero-1", x: 1, y: 1, range: 1, power: 3, dueAt: 100 };
    expect(advanceStage(state)).toBe(false);
    stepSimulation(state, 100, NOW);
    expect(state.stage).toBe(2);
    expect(state.runId).toBe("run-test-123");
    expect(state.heroes["hero-1"].energy).toBe(199);
    expect(advanceStage(state)).toBe(false);
  });
  it("continues across ten stage transitions without a client completion request", () => {
    const state = testState();
    const maps = new Set([state.mapId]);
    for (let i = 0; i < 10; i++) {
      Object.values(state.nodes).forEach((n) => {
        n.destroyed = true;
        n.hp = 0;
      });
      const result = stepSimulation(state, 100, NOW);
      expect(result.effects.some((effect) => effect.type === "stage")).toBe(true);
      maps.add(state.mapId);
    }
    expect(state.stage).toBe(11);
    expect(maps.size).toBe(11);
  });
});
