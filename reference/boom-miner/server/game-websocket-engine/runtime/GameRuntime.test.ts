import { describe, expect, it } from "vitest";
import { GameRuntime } from "./GameRuntime";
import { testState } from "@/features/game/testing";
describe("player operation queue", () => {
  it("serializes operations, drains, and recovers after a failure", async () => {
    const runtime = new GameRuntime(testState(), {
      wallet: "player",
      instanceId: "test",
      fencingToken: 1,
      expiresAt: new Date(),
    });
    const order: number[] = [];
    const first = runtime.enqueue(async () => {
      await Promise.resolve();
      order.push(1);
      throw new Error("test");
    });
    const second = runtime.enqueue(() => {
      order.push(2);
    });
    await expect(first).rejects.toThrow("test");
    await second;
    await runtime.drain();
    expect(order).toEqual([1, 2]);
  });
  it("bounds command backlog", async () => {
    const runtime = new GameRuntime(testState(), {
      wallet: "player",
      instanceId: "test",
      fencingToken: 1,
      expiresAt: new Date(),
    });
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const commands = Array.from({ length: 32 }, () => runtime.command(() => wait));
    await expect(runtime.command(async () => undefined)).rejects.toThrow("COMMAND_QUEUE_FULL");
    release();
    await Promise.all(commands);
    expect(runtime.commandCount).toBe(0);
  });
});
