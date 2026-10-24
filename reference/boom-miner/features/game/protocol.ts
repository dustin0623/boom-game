import type { GameCommand, GameEffect, GameHero, GameNode, GameState } from "./types";

export const PROTOCOL_VERSION = 2;
export const GAME_EVENTS = {
  COMMAND: "game:command",
  RESULT: "game:result",
  SNAPSHOT: "game:snapshot",
  UPDATE: "game:update",
  MOTION: "game:motion",
  SYNC: "game:sync",
  ERROR: "game:error",
} as const;
export interface CommandRequest {
  requestId: string;
  runId: string;
  command: GameCommand;
}
export interface CommandResult {
  requestId: string;
  ok: boolean;
  revision: number;
  code?: string;
}
export interface Snapshot {
  protocolVersion: 2;
  frame: number;
  state: GameState;
}
export interface GameUpdate {
  runId: string;
  mapId: string;
  previousRevision: number;
  revision: number;
  time: number;
  paused: boolean;
  coins: number;
  daily: GameState["daily"];
  heroes: Record<string, GameHero>;
  bombs: GameState["bombs"];
  nodes: Record<string, GameNode>;
  effects: GameEffect[];
}
export interface GameMotion {
  runId: string;
  mapId: string;
  revision: number;
  frame: number;
  time: number;
  heroes: Record<string, Pick<GameHero, "x" | "y" | "phase">>;
}
export type SyncRequest =
  { action: "request" } | { action: "ready"; runId: string; revision: number };
export interface GameError {
  code: string;
  message: string;
  retryable: boolean;
}
