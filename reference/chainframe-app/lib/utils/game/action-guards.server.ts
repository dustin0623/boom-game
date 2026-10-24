import { gameActionSeed } from "@/lib/utils/game/execution-context.server";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";

/**
 * Per-process abuse guards for Sabotage / Help. They are a first line of
 * defence only: correctness never depends on them, because the database's
 * guarded consume and conditional apply are what keep state consistent
 * across processes.
 */

const inFlight = new Set<string>();
const attempts = new Map<string, number[]>();

const pairKey = (caller: string, target: string) => `${caller}->${target}`;

export type SocialGuardRelease = () => void;

/**
 * Claims the caller/target pair so an identical request that arrives while the
 * first is still running is rejected instead of racing it. Returns a release
 * function, or null when the pair is already in flight.
 */
export function acquireSocialLock(
  caller: string,
  target: string,
): SocialGuardRelease | null {
  const key = pairKey(caller, target);
  if (inFlight.has(key)) return null;
  inFlight.add(key);
  return () => {
    inFlight.delete(key);
  };
}

const purchasesInFlight = new Set<string>();

/**
 * Claims a wallet/item purchase so a double-click or replayed request that
 * arrives while the first is still running is rejected instead of charging
 * twice. Returns a release function, or null when one is already in flight.
 */
export function acquirePurchaseLock(
  wallet: string,
  itemId: string,
): SocialGuardRelease | null {
  const key = `${wallet}:${itemId}`;
  if (purchasesInFlight.has(key)) return null;
  purchasesInFlight.add(key);
  return () => {
    purchasesInFlight.delete(key);
  };
}

/** Sliding-window limit per caller. Returns false once the caller is over the limit. */
export function allowSocialAction(caller: string, now = Date.now()): boolean {
  // The ordered chain processor already authenticates and deduplicates. Wall-clock limits must not reject transaction retries.
  if (gameActionSeed()) return true;
  const { maxActionsPerWindow, windowMs } = SOCIAL_ECONOMY.socialActionLimits;
  const recent = (attempts.get(caller) ?? []).filter(
    (at) => now - at < windowMs,
  );
  if (recent.length >= maxActionsPerWindow) {
    attempts.set(caller, recent);
    return false;
  }
  recent.push(now);
  attempts.set(caller, recent);
  return true;
}

export function resetSocialGuards(): void {
  inFlight.clear();
  purchasesInFlight.clear();
  attempts.clear();
}
