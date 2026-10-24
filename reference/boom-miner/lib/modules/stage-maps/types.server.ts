/**
 * lib/modules/stage-maps/types.server.ts
 *
 * Pure TypeScript types for the `stage-maps` domain.
 * No mongoose runtime code — interfaces only.
 */

import type { Document } from "mongoose";
import type { ChestRarity } from "@/features/types/ChestRarity";
import type { GameBomb, GameHero } from "@/features/game/types";

export interface GameCheckpoint {
  runId: string;
  mapId: string;
  revision: number;
  time: number;
  random: number;
  bombSerial: number;
  paused: boolean;
  bombs: Record<string, GameBomb>;
  movement: Record<string, Pick<GameHero, "x" | "y" | "path" | "phase" | "target">>;
}

export type NodeKind = "chest" | "bush";

export interface MapNode {
  x: number;
  y: number;
  kind: NodeKind;
  /** Rarity — chests only. */
  rarity?: ChestRarity;
  maxHp: number;
  /** Current hp; 0 = destroyed. */
  hp: number;
  /** Coin reward on destroy. */
  coins: number;
  destroyed: boolean;
}

export interface IStageMap extends Document {
  game?: GameCheckpoint;
  /** Wallet address — unique (one document per player). */
  playerId: string;
  /** Authoritative stage; player.stage is updated as a compatibility projection. */
  stage: number;
  /** Seeded PRNG seed used for the CURRENT stage layout. Never accepted from client. */
  seed: number;
  /** Grid width snapshot (MAP_WIDTH = 41). */
  width: number;
  /** Grid height snapshot (MAP_HEIGHT = 25). */
  height: number;
  /** Nodes keyed by "x,y". */
  nodes: Map<string, MapNode>;
  createdAt: Date;
  updatedAt: Date;
}
