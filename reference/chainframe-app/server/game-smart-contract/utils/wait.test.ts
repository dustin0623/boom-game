import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wait } from "./wait";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("abortable smart-contract waiting", () => {
  it("waits the requested duration and removes its listener on completion", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const done = vi.fn();
    const pending = wait(5000, controller.signal).then(done);
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels immediately without waiting for the timer", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = wait(5000, controller.signal);
    controller.abort();
    await pending;
    expect(remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not install resources for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const add = vi.spyOn(controller.signal, "addEventListener");
    await wait(5000, controller.signal);
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps concurrent waits independent during cancellation", async () => {
    const first = new AbortController();
    const second = new AbortController();
    const finish = vi.fn();
    const a = wait(1000, first.signal);
    const b = wait(1000, second.signal).then(finish);
    first.abort();
    await a;
    expect(finish).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await b;
    expect(finish).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
