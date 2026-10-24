import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/features/stores/game.store";
import { createSessionState } from "@/game/demo/demo";
import { applyCommand, walkable } from "@/lib/game/dungeon/simulation";
import type { GameState } from "@/lib/game/dungeon/types";
import type { PlayerSession } from "@/lib/game/session/types";

vi.mock("phaser", () => ({ Scene: class {}, Scenes: { Events: { SHUTDOWN: "shutdown" } } }));
vi.mock("../systems/MapManager", () => ({ MapManager: class {} }));
vi.mock("../entities/Hero", () => ({ Hero: class {} }));
vi.mock("../entities/Bomb", () => ({ Bomb: class {} }));

import { TreasureScene } from "./TreasureScene";

interface SceneHarness {
  live: GameState;
  session: PlayerSession;
  awaitingStage: boolean;
  stageHoldUntil: number;
  syncElapsed: number;
  pendingKeys: Set<string>;
  time: { now: number; delayedCall: (delay: number, callback: () => void) => void };
  scene: { isActive: () => boolean };
  apply: (state: GameState) => void;
  tickSync: (delta: number) => void;
}

afterEach(() => {
  useGameStore.setState({ session: null, syncer: null, heroesSyncer: null, inFlight: 0, stageClearing: false });
});

describe("confirmed stage handoff", () => {
  it("resumes stage 2 even when update runs at the hold deadline before its timer", async () => {
    const session: PlayerSession = {
      playerId: "player", stage: 1, seed: 12345, coins: 100, destroyedNodes: [],
      heroes: [{ id: "hero", name: "Miner", type: "ricky", rarity: "common", power: 3, speed: 3, stamina: 10, bombNumber: 1, bombRange: 2, maxEnergy: 100, energy: 100, onMap: false, recoveryAt: 0 }],
    };
    const live = createSessionState(session);
    applyCommand(live, { type: "deploy", heroId: "hero" }, Date.now());
    const worker = live.heroes["hero"];
    if (!worker) throw new Error("Missing test hero");
    worker.energy = 40;
    for (const node of Object.values(live.nodes)) { node.destroyed = true; node.hp = 0; }
    const scene = new TreasureScene();
    const harness = scene as unknown as SceneHarness;
    let complete: (() => void) | undefined;
    harness.live = live;
    harness.session = session;
    harness.awaitingStage = true;
    harness.syncElapsed = 4000;
    harness.time = { now: 0, delayedCall: (_delay, callback) => { complete = callback; } };
    harness.scene = { isActive: () => true };
    harness.apply = vi.fn();
    useGameStore.getState().setSession(session, async () => ({ ok: true, stage: 2, seed: 54321, coins: 200, destroyedNodes: [], accepted: 1, rejected: 0 }));
    harness.tickSync(0);
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));

    // Reproduce Phaser's deadline ordering: update sees the old cleared map
    // before the delayed callback gets its turn in this frame.
    harness.time.now = harness.stageHoldUntil;
    scene.update(harness.time.now, 100);
    expect(harness.awaitingStage).toBe(true);
    if (!complete) throw new Error("Missing stage installation callback");
    complete();
    expect(harness.live.stage).toBe(2);
    expect(harness.awaitingStage).toBe(false);
    expect(harness.session.stage).toBe(2);
    const nextWorker = harness.live.heroes["hero"];
    if (!nextWorker) throw new Error("Missing next-stage hero");
    expect(nextWorker.energy).toBe(40);
    expect(nextWorker.onMap).toBe(true);
    expect(walkable(harness.live, nextWorker)).toBe(true);
    for (let i = 0; i < 100; i++) scene.update(harness.time.now + i * 100, 100);
    expect(harness.live.bombSerial).toBeGreaterThan(0);
    expect(useGameStore.getState().session?.stage).toBe(2);
    expect(useGameStore.getState().stageClearing).toBe(false);
  });
});