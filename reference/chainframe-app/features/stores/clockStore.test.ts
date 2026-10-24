import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClock } from "./clockStore";
const cleanups: Array<() => void> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
  vi.useRealTimers();
});
describe("shared clock", () => {
  it("starts one timer for subscribers at the same cadence", () => {
    const a = getClock(1000),
      b = getClock(1000);
    expect(a).toBe(b);
    const first = vi.fn(),
      second = vi.fn();
    cleanups.push(a.subscribe(first), b.subscribe(second));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it("stops only after the final subscriber leaves and restarts with current time", () => {
    const clock = getClock(2000);
    const first = clock.subscribe(vi.fn()),
      second = clock.subscribe(vi.fn());
    first();
    expect(vi.getTimerCount()).toBe(1);
    second();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    cleanups.push(clock.subscribe(vi.fn()));
    expect(clock.getSnapshot()).toBe(Date.now());
  });
  it("creates independent timers for distinct cadences", () => {
    cleanups.push(
      getClock(3000).subscribe(vi.fn()),
      getClock(4000).subscribe(vi.fn()),
    );
    expect(vi.getTimerCount()).toBe(2);
  });
  it("has a stable snapshot without creating a timer", () => {
    const clock = getClock(9000);
    expect(clock.getSnapshot()).toBe(clock.getSnapshot());
    expect(vi.getTimerCount()).toBe(0);
  });
});
