import { describe, expect, it } from "vitest";
import { useGameStore } from "./game.store";

const hero = { id: "h1", name: "A", type: "t", rarity: "common", power: 1, speed: 1, stamina: 1, bombNumber: 1, bombRange: 1, maxEnergy: 100, energy: 100 };

describe("game store sync", () => {
  it("keeps live hero stamina in the cached session", () => {
    useGameStore.getState().setSession({ playerId: "p", coins: 0, stage: 1, seed: 1, destroyedNodes: [], heroes: [hero] }, null);
    useGameStore.getState().patchSessionHeroes([{ id: "h1", energy: 40, onMap: true, recoveryAt: 5 }]);
    expect(useGameStore.getState().session!.heroes[0]).toMatchObject({ energy: 40, onMap: true, recoveryAt: 5 });
  });

  it("shows saved only after every save is confirmed", () => {
    const s = useGameStore.getState();
    s.beginSave();
    s.beginSave();
    s.endSave(true);
    expect(useGameStore.getState().saveStatus).toBe("saving");
    s.endSave(true);
    expect(useGameStore.getState().saveStatus).toBe("saved");
  });
});
