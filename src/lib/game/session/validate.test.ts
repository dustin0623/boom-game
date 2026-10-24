import { describe, expect, it } from "vitest";
import { generateStageMap } from "@/lib/game/dungeon/generate";
import { keyOf } from "@/lib/game/dungeon/simulation";
import { validateClaims } from "./validate";

const STAGE = 3;
const SEED = 123456;
const ELAPSED_MS = 600_000;

/** Claim everything on the map (bushes are free, chests pay). */
function claimAll(exceptChestKeys: string[] = []) {
  const nodes = generateStageMap(STAGE, SEED);
  const claimed = nodes
    .filter((n) => !(n.kind === "chest" && exceptChestKeys.includes(keyOf(n))))
    .map(keyOf);
  return { nodes, claimed };
}

describe("validateClaims stage clearing", () => {
  it("reports cleared when every chest of the map is destroyed", () => {
    const { claimed } = claimAll();
    const outcome = validateClaims({
      stage: STAGE,
      seed: SEED,
      destroyed: [],
      claimed,
      elapsedMs: ELAPSED_MS,
    });
    expect(outcome.cleared).toBe(true);
    expect(outcome.rejected).toBe(0);
  });

  it("does not report cleared while any chest remains", () => {
    const { nodes, claimed } = claimAll();
    const chest = nodes.find((n) => n.kind === "chest")!;
    const outcome = validateClaims({
      stage: STAGE,
      seed: SEED,
      destroyed: [],
      claimed: claimed.filter((k) => k !== keyOf(chest)),
      elapsedMs: ELAPSED_MS,
    });
    expect(outcome.cleared).toBe(false);
  });

  it("credits coins only for chests, never for bushes", () => {
    const { nodes, claimed } = claimAll();
    const outcome = validateClaims({
      stage: STAGE,
      seed: SEED,
      destroyed: [],
      claimed,
      elapsedMs: ELAPSED_MS,
    });
    const bushKeys = new Set(nodes.filter((n) => n.kind === "bush").map(keyOf));
    for (const key of bushKeys) expect(outcome.rewards[key]).toBe(0);
    const chestCoins = nodes.filter((n) => n.kind === "chest").reduce((s, n) => s + n.coins, 0);
    expect(outcome.coins).toBe(chestCoins);
  });
});
