import { create } from "zustand";
import type { PlayerSession, SessionHero, SyncResult } from "@/lib/game/session/types";

export type SaveStatus = "local" | "connecting" | "saved" | "saving" | "error";

/** Sends destroyed block keys for one map seed and returns the server's confirmed state. */
export type ProgressSyncer = (seed: number, keys: string[]) => Promise<SyncResult>;

/** Live hero state persisted to the server so it survives refresh and device changes. */
export interface HeroStatePayload {
  id: string;
  energy: number;
  onMap: boolean;
  recoveryAt: number;
}

/** Persists live hero energy / deploy state to the cloud database. */
export type HeroesSyncer = (heroes: HeroStatePayload[]) => Promise<void>;

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
  /** True while the last chest is destroyed and the server verifies the clear. */
  stageClearing: boolean;
  /** True while the tab is hidden or the window lost focus — heroes stop working. */
  gamePaused: boolean;
  setGamePaused: (paused: boolean) => void;
  syncer: ProgressSyncer | null;
  heroesSyncer: HeroesSyncer | null;
  saveStatus: SaveStatus;
  roster: RosterHero[];
  /** Deploy/recall requests waiting for the scene to apply them. */
  commands: HeroCommand[];
  deployError: string | null;
  setStats: (stats: { coins: number; stage: number; heroesOnMap: number }) => void;
  setSession: (
    session: PlayerSession | null,
    syncer: ProgressSyncer | null,
    heroesSyncer?: HeroesSyncer | null,
  ) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setStageClearing: (clearing: boolean) => void;
  setRoster: (roster: RosterHero[]) => void;
  sendCommand: (command: HeroCommand) => void;
  takeCommands: () => HeroCommand[];
  setDeployError: (error: string | null) => void;
  /** Appends freshly minted heroes so the play scene and drawer pick them up instantly. */
  addHeroes: (heroes: SessionHero[]) => void;
  /** Keeps the cached session in step with the server's confirmed map so re-opening Play resumes it. */
  patchSession: (patch: Partial<Pick<PlayerSession, "coins" | "stage" | "seed" | "destroyedNodes">>) => void;
  reset: () => void;
}

export const useGameStore = create<GameRuntimeState>((set, get) => ({
  coins: 0,
  stage: 1,
  heroesOnMap: 0,
  session: null,
  stageClearing: false,
  gamePaused: false,
  setGamePaused: (gamePaused) => set({ gamePaused }),
  syncer: null,
  heroesSyncer: null,
  saveStatus: "local",
  roster: [],
  commands: [],
  deployError: null,
  setStats: (stats) => set(stats),
  setSession: (session, syncer, heroesSyncer = null) => set({ session, syncer, heroesSyncer }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setStageClearing: (stageClearing) => set({ stageClearing }),
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
  patchSession: (patch) => set((s) => (s.session ? { session: { ...s.session, ...patch } } : {})),
  reset: () => set({ coins: 0, stage: 1, heroesOnMap: 0, roster: [], commands: [], stageClearing: false }),
}));
