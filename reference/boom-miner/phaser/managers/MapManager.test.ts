import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { MapManager } from "./MapManager";
import { testState } from "@/features/game/testing";

function renderer() {
  const graphics = Object.fromEntries(["setDepth", "clear", "fillStyle", "fillRect", "lineStyle", "strokeRect"].map((name) => [name, vi.fn().mockReturnThis()]));
  const images: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const scene = { add: { graphics: () => graphics, image: () => {
    const image = { setDepth: vi.fn().mockReturnThis(), setDisplaySize: vi.fn().mockReturnThis(), destroy: vi.fn() };
    images.push(image); return image;
  } } };
  return { manager: new MapManager(scene as unknown as Phaser.Scene), images };
}
describe("authoritative map presentation", () => {
  it("replaces all old sprites on a new map rather than retaining absent nodes", () => {
    const { manager, images } = renderer(); const state = testState();
    manager.apply(state); expect(images).toHaveLength(2);
    manager.apply({ ...state, mapId: "new", nodes: { "3,1": state.nodes["3,1"] } });
    expect(images[0].destroy).toHaveBeenCalledOnce(); expect(images[1].destroy).toHaveBeenCalledOnce(); expect(images).toHaveLength(3);
  });
  it("removes destroyed nodes without creating replacements or changing gameplay", () => {
    const { manager, images } = renderer(); const state = testState(); manager.apply(state);
    const update = { ...state, nodes: { ...state.nodes, "3,1": { ...state.nodes["3,1"], hp: 0, destroyed: true } } };
    manager.apply(update); expect(images[0].destroy).toHaveBeenCalledOnce(); expect(images).toHaveLength(2);
    expect(state.nodes["3,1"].hp).toBe(3); expect(state.coins).toBe(0);
  });
});
