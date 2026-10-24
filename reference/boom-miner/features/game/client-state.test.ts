import { describe, expect, it } from "vitest";
import { applyMotion, applyUpdate } from "./client-state";
import { testState } from "./testing";
import type { GameUpdate } from "./protocol";
describe("frontend revision handling", () => {
  it("requires recovery on a revision gap or another map", () => {
    const state = testState();
    const update: GameUpdate = { ...state, previousRevision: 1, revision: 2, effects: [] };
    expect(applyUpdate(state, update)).toBeNull();
    expect(applyUpdate(state, { ...update, previousRevision: 0, mapId: "other" })).toBeNull();
  });
  it("ignores old updates and frames, and applies changed nodes", () => {
    const state = testState();
    const update: GameUpdate = {
      ...state,
      previousRevision: 0,
      revision: 1,
      nodes: {},
      effects: [],
    };
    const next = applyUpdate(state, update)!;
    expect(next.nodes).toEqual(state.nodes);
    expect(applyUpdate(next, update)).toBe(next);
    const motion = {
      runId: state.runId,
      mapId: state.mapId,
      revision: 1,
      frame: 2,
      time: 100,
      heroes: { "hero-1": { x: 2, y: 1, phase: "moving" as const } },
    };
    expect(applyMotion(next, motion, 2)).toBe(next);
    expect(applyMotion(next, motion, 1).heroes["hero-1"].x).toBe(2);
  });
});
