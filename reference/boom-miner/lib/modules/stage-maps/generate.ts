/**
 * lib/modules/stage-maps/generate.ts
 *
 * Deterministic, framework-free map generation.
 * Same seed → same layout, always. Used by the server at create/completeStage.
 *
 * Ported from phaser/managers/MapManager.ts#generate() with Math.random /
 * Phaser.Math.Between replaced by a mulberry32 seeded PRNG.
 */

import {
  TileType,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "@/features/types/TileTypes";
import {
  ChestRarity,
  CHEST_STATS,
  pickChestRarity,
} from "@/features/types/ChestRarity";
import type { MapNode } from "./types.server";

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------

/** Returns a PRNG function whose output is in [0, 1). */
export function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Returns a seeded random integer in [min, max] inclusive. */
function between(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------

/**
 * Generates a full stage-map node list from a seed.
 *
 * @param _stage  Stage number (reserved for future per-stage density tuning).
 * @param seed    Seeded PRNG initializer.
 * @param width   MAP_WIDTH (41).
 * @param height  MAP_HEIGHT (25).
 * @returns       Array of MapNode; one entry per destructible tile.
 */
export function generateStageMap(
  _stage: number,
  seed: number,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
): MapNode[] {
  const rand = makePrng(seed);

  // Build the base grid: perimeter + every even-even interior = wall; rest = grass.
  const grid: TileType[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push(TileType.Wall);
      } else if (x % 2 === 0 && y % 2 === 0) {
        row.push(TileType.Wall);
      } else {
        row.push(TileType.Grass);
      }
    }
    grid.push(row);
  }

  const spawnFree = new Set(["1,1", "2,1", "1,2"]);

  // Decide total chest count for this map: random 55–65.
  const targetChests = between(rand, 55, 65);

  // Collect all eligible grass tiles first.
  const grassTiles: { x: number; y: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] !== TileType.Grass) continue;
      if (spawnFree.has(`${x},${y}`)) continue;
      grassTiles.push({ x, y });
    }
  }

  // Shuffle tiles with the seeded PRNG so placement is deterministic.
  for (let i = grassTiles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [grassTiles[i], grassTiles[j]] = [grassTiles[j], grassTiles[i]];
  }

  const nodes: MapNode[] = [];
  let chestsPlaced = 0;

  for (const { x, y } of grassTiles) {
    // Keep placing until we hit the chest target, then fill remaining slots
    // with ~60% bush density so the map isn't completely bare.
    if (chestsPlaced < targetChests) {
      const rarity = pickChestRarity(rand);
      const s = CHEST_STATS[rarity];
      nodes.push({
        x,
        y,
        kind:      "chest",
        rarity,
        maxHp:     s.hp,
        hp:        s.hp,
        coins:     s.coins,
        destroyed: false,
      });
      chestsPlaced++;
    } else {
      // ~60 % of remaining tiles get a bush.
      if (between(rand, 0, 99) < 60) {
        nodes.push({
          x,
          y,
          kind:  "bush",
          maxHp: 1,
          hp:    1,
          coins: 0,
          destroyed: false,
        });
      }
    }
  }

  return nodes;
}

/** Rolls a random seed suitable for map generation. */
export function rollSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
