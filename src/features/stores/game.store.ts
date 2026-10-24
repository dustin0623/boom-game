import { create } from "zustand";

/** Shared React ↔ Phaser runtime state for the play screen (local demo only for now). */
interface GameRuntimeState {
  coins: number;
  stage: number;
  heroesOnMap: number;
  paused: boolean;
  setStats: (stats: { coins: number; stage: number; heroesOnMap: number }) => void;
  setPaused: (paused: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameRuntimeState>((set) => ({
  coins: 0,
  stage: 1,
  heroesOnMap: 0,
  paused: false,
  setStats: (stats) => set(stats),
  setPaused: (paused) => set({ paused }),
  reset: () => set({ coins: 0, stage: 1, heroesOnMap: 0, paused: false }),
}));
