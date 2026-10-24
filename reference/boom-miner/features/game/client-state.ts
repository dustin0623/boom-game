import type { GameMotion, GameUpdate } from "./protocol";
import type { GameState } from "./types";

/** Returns null on a gap; callers must obtain a snapshot before rendering more state. */
export function applyUpdate(state: GameState, update: GameUpdate): GameState | null {
  if (update.runId !== state.runId || update.mapId !== state.mapId) return null;
  if (update.revision <= state.revision) return state;
  if (update.previousRevision !== state.revision) return null;
  return {
    ...state,
    revision: update.revision,
    time: update.time,
    paused: update.paused,
    coins: update.coins,
    daily: update.daily,
    heroes: update.heroes,
    bombs: update.bombs,
    nodes: { ...state.nodes, ...update.nodes },
  };
}
export function applyMotion(state: GameState, motion: GameMotion, frame: number): GameState {
  if (
    motion.runId !== state.runId ||
    motion.mapId !== state.mapId ||
    motion.revision !== state.revision ||
    motion.frame <= frame ||
    motion.time < state.time
  )
    return state;
  const heroes = { ...state.heroes };
  for (const [id, position] of Object.entries(motion.heroes))
    if (heroes[id]) heroes[id] = { ...heroes[id], ...position };
  return { ...state, time: motion.time, heroes };
}
