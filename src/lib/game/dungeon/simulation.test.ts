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
