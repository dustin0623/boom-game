import { create } from "zustand";
import type { PlayerSession, SessionHero, SyncResult } from "@/lib/game/session/types";

export type SaveStatus = "local" | "connecting" | "saved" | "saving" | "error";

/** Sends destroyed block keys for one map seed and returns the server's confirmed state. */
export type ProgressSyncer = (seed: number, keys: string[]) => Promise<SyncResult>;

/** Live hero status published by the scene for the heroes drawer. */
export interface RosterHero extends SessionHero {
  energy: number;
  onMap: boolean;
}

export interface HeroCommand {
  type: "deploy" | "recall";
  heroId: string;
}

/** Shared React ↔ Phaser runtime state for the play screen. */
interface GameRuntimeState {
  coins: number;
  stage: number;
  heroesOnMap: number;
  /** Saved cloud session; null means the scene runs a local, unsaved board. */
  session: PlayerSession | null;
  syncer: ProgressSyncer | null;
  saveStatus: SaveStatus;
  roster: RosterHero[];
  /** Deploy/recall requests waiting for the scene to apply them. */
  commands: HeroCommand[];
  deployError: string | null;
  setStats: (stats: { coins: number; stage: number; heroesOnMap: number }) => void;
  setSession: (session: PlayerSession | null, syncer: ProgressSyncer | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setRoster: (roster: RosterHero[]) => void;
  sendCommand: (command: HeroCommand) => void;
  takeCommands: () => HeroCommand[];
  setDeployError: (error: string | null) => void;
  /** Appends freshly minted heroes so the play scene and drawer pick them up instantly. */
  addHeroes: (heroes: SessionHero[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameRuntimeState>((set, get) => ({
  coins: 0,
  stage: 1,
  heroesOnMap: 0,
  session: null,
  syncer: null,
  saveStatus: "local",
  roster: [],
  commands: [],
  deployError: null,
  setStats: (stats) => set(stats),
  setSession: (session, syncer) => set({ session, syncer }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setRoster: (roster) => set({ roster }),
  sendCommand: (command) => set((s) => ({ commands: [...s.commands, command], deployError: null })),
  takeCommands: () => {
    const commands = get().commands;
    if (commands.length) set({ commands: [] });
    return commands;
  },
  setDeployError: (deployError) => set({ deployError }),
  addHeroes: (heroes) =>
    set((s) => {
      if (!s.session) return {};
      const known = new Set(s.session.heroes.map((h) => h.id));
      const fresh = heroes.filter((h) => !known.has(h.id));
      if (!fresh.length) return {};
      return { session: { ...s.session, heroes: [...s.session.heroes, ...fresh] } };
    }),
  reset: () => set({ coins: 0, stage: 1, heroesOnMap: 0, roster: [], commands: [] }),
}));
