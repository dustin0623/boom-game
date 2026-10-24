import { useSyncExternalStore } from "react";
import { getClock } from "@/features/stores/clockStore";
const serverSnapshot = () => 0;
/** All consumers at the same cadence share one browser timer. */
export const useNow = (intervalMs = 1000): number => {
  const clock = getClock(intervalMs);
  return useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    serverSnapshot,
  );
};
