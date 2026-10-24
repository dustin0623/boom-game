import { createStore } from "zustand/vanilla";
/** Shared transient clock sources; one timer per cadence, only while subscribed. */
interface Clock {
  getSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
}
const clocks = new Map<number, Clock>();
export function getClock(intervalMs: number): Clock {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0)
    throw new Error("Clock interval must be a positive integer");
  const cached = clocks.get(intervalMs);
  if (cached) return cached;
  const store = createStore(() => ({ now: 0 }));
  let subscribers = 0,
    timer: ReturnType<typeof setInterval> | undefined;
  const clock: Clock = {
    getSnapshot: () => store.getState().now,
    subscribe: (listener) => {
      subscribers++;
      if (!timer) {
        store.setState({ now: Date.now() });
        timer = setInterval(
          () => store.setState({ now: Date.now() }),
          intervalMs,
        );
      }
      const unsubscribe = store.subscribe(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        unsubscribe();
        subscribers--;
        if (!subscribers && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
  };
  clocks.set(intervalMs, clock);
  return clock;
}
