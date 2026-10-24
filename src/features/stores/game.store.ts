import { create } from "zustand";
import type { PlayerSession, SyncResult } from "@/lib/game/session/types";

export type SaveStatus = "local" | "connecting" | "saved" | "saving" | "error";

/** Sends destroyed block keys for one map seed and returns the server's confirmed state. */
export type ProgressSyncer = (seed: number, keys: string[]) => Promise<SyncResult>;

/** Shared React ↔ Phaser runtime state for the play screen. */
interface GameRuntimeState {
  coins: number;
  stage: number;
  heroesOnMap: number;
  /** Saved cloud session; null means the scene runs a local, unsaved board. */
  session: PlayerSession | null;
  syncer: ProgressSyncer | null;
  saveStatus: SaveStatus;
  setStats: (stats: { coins: number; stage: number; heroesOnMap: number }) => void;
  setSession: (session: PlayerSession | null, syncer: ProgressSyncer | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  reset: () => void;
}

export const useGameStore = create<GameRuntimeState>((set) => ({
  coins: 0,
  stage: 1,
  heroesOnMap: 0,
  session: null,
  syncer: null,
  saveStatus: "local",
  setStats: (stats) => set(stats),
  setSession: (session, syncer) => set({ session, syncer }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  reset: () => set({ coins: 0, stage: 1, heroesOnMap: 0 }),
}));
