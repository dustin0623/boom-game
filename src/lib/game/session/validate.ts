import { generateStageMap } from "@/lib/game/dungeon/generate";
import { keyOf } from "@/lib/game/dungeon/simulation";

/** Chests a client may report in a sync: a small burst plus a steady rate per elapsed second. */
export const CHEST_BURST = 4;
export const CHESTS_PER_SECOND = 3;

export interface ClaimInput {
  stage: number;
  seed: number;
  destroyed: string[];
  claimed: string[];
  elapsedMs: number;
}

export interface ClaimOutcome {
  destroyed: string[];
  coins: number;
  accepted: number;
  rejected: number;
  /** Newly accepted keys → coins (0 for bushes). */
  rewards: Record<string, number>;
  /** True when every chest of this map is now destroyed. */
  cleared: boolean;
}

/**
 * Server-side check of reported destroyed blocks. Only nodes that exist on the
 * seeded map and are not yet destroyed count; coins come from the map itself,
 * never from the client; chest count is limited by elapsed time.
 */
export function validateClaims(input: ClaimInput): ClaimOutcome {
  const nodes = new Map(generateStageMap(input.stage, input.seed).map((n) => [keyOf(n), n]));
  const destroyed = new Set(input.destroyed);
  const chestBudget = CHEST_BURST + Math.floor((Math.max(0, input.elapsedMs) / 1000) * CHESTS_PER_SECOND);
  let coins = 0;
  let accepted = 0;
  let rejected = 0;
  let chests = 0;
  const rewards: Record<string, number> = {};
  for (const key of new Set(input.claimed)) {
    const node = nodes.get(key);
    if (!node || destroyed.has(key)) {
      rejected++;
      continue;
    }
    if (node.kind === "chest") {
      if (chests >= chestBudget) {
        rejected++;
        continue;
      }
      chests++;
      coins += node.coins;
    }
    destroyed.add(key);
    rewards[key] = node.kind === "chest" ? node.coins : 0;
    accepted++;
  }
  const cleared = [...nodes.entries()].every(([k, n]) => n.kind !== "chest" || destroyed.has(k));
  return { destroyed: [...destroyed], coins, accepted, rejected, rewards, cleared };
}
