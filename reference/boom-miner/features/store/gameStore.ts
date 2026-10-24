"use client";

import { create } from "zustand";
import type { HeroRarity, HeroType } from "@/features/types/HeroRarity";
import {
  MINT_COST,
  MAX_ON_MAP,
  ENERGY_PER_STAMINA,
  RECOVERY_INTERVAL_SECONDS,
  MIN_DEPLOY_ENERGY_FRACTION,
  maxEnergyFor,
  minDeployEnergyFor,
  canDeployEnergy,
} from "@/lib/constants/game";
import type { ProcessedTx } from "@/hooks/useSettlementNotifier";

// Re-export so client code can still import these from "@/features/store/gameStore".
export {
  MINT_COST,
  MAX_ON_MAP,
  ENERGY_PER_STAMINA,
  RECOVERY_INTERVAL_SECONDS,
  MIN_DEPLOY_ENERGY_FRACTION,
  maxEnergyFor,
  minDeployEnergyFor,
  canDeployEnergy,
};

export interface HeroSnapshot {
  id: string;
  tileX: number;
  tileY: number;
  state: string;
  type: string;
  rarity: string;
  rarityLabel: string;
  power: number;
  speed: number;
  stamina: number;
  bombNum: number;
  bombRange: number;
  energy: number;
  currentEnergy: number;
}

/** NFT-style character metadata attributes. */
export interface HeroAttributesMeta {
  power: number;
  speed: number;
  stamina: number;
  bomb_number: number;
  bomb_range: number;
}

/** Marketplace listing metadata. */
export interface HeroMarketMeta {
  listed: boolean;
  price: number;
  seller: string | null;
  created: number;
  sold: number;
}

/**
 * Persistent owned hero, shaped as an NFT metadata record.
 * Runtime-only fields (type, rarityLabel, currentEnergy, maxEnergy, onMap)
 * live alongside the metadata for gameplay state.
 */
export interface RosterHero {
  // --- Internal identity (MongoDB _id string) ---
  id: string;

  // --- NFT metadata (canonical format) ---
  name: string;
  /** Sequential mint number — unique, server-assigned. Used as #1234 in UI. */
  minted_number: number;
  description: string;
  image: string | null;
  owner: string;
  level: number;
  rarity: HeroRarity | null;
  attributes: HeroAttributesMeta;
  market: HeroMarketMeta;

  // --- Runtime game state (not persisted to metadata) ---
  type: HeroType;
  rarityLabel: string;
  /** Current energy points. Max = stamina * ENERGY_PER_STAMINA. Each exploded bomb consumes 1. */
  currentEnergy: number;
  /** Cached max energy (stamina * ENERGY_PER_STAMINA). */
  maxEnergy: number;
  onMap: boolean;
  /** Display-only recovery anchor; the service validates deployment. */
  recoveryAt?: number;
}

/**
 * Shape returned by GET /api/bootstrap.
 * Server-authoritative fields only — cosmetics stay on the client.
 */
export interface BootstrapPayload {
  player: {
    wallet: string;
    username: string | null;
    coins: number;
    stage: number;
  };
  /** Raw IHero documents from the server — mapped to RosterHero on hydration. */
  heroes: RosterHero[];
}

export { documentToRoster as iHeroToRosterHero } from "@/features/game/serialize";

interface GameState {
  wallet: string | null;
  coins: number;
  stage: number;
  roster: RosterHero[];
  mapHeroes: HeroSnapshot[];
  gamePaused: boolean;
  bootstrapped: boolean;
  selectedHero: string | null;
  deployError: string | null;
  pendingHeroes: string[];
  sessionError: string | null;
  connectionLost: boolean;
  demoMode: boolean;
  stageValidating: boolean;
  stageValidated: boolean;
  lastMintTxHash: string | null;
  lastWithdrawalTxHash: string | null;
  lastMintTx: ProcessedTx | null;
  hydrate: (payload: BootstrapPayload) => void;
  hydrateFromServer: (coins: number, stage: number) => void;
  hydrateRoster: (heroes: RosterHero[]) => void;
  reconcile: (patch: { coins?: number; stage?: number }) => void;
  setSettlement: (type: "mint" | "withdrawal", txHash: string, tx?: ProcessedTx) => void;
  setMapHeroes: (heroes: HeroSnapshot[]) => void;
  setPaused: (paused: boolean) => void;
  selectHero: (id: string | null) => void;
  setDeployError: (message: string | null) => void;
  setPendingHeroes: (ids: string[]) => void;
  removeFromRoster: (id: string) => void;
  setStageValidating: (value: boolean) => void;
  setStageValidated: (value: boolean) => void;
  setSessionError: (message: string | null) => void;
  setConnectionLost: (value: boolean) => void;
  setDemoMode: (value: boolean) => void;
}

/** UI projection only. Gameplay and reward mutations belong to the game service. */
export const useGameStore = create<GameState>((set) => ({
  wallet: null,
  coins: 0,
  stage: 1,
  roster: [],
  mapHeroes: [],
  gamePaused: false,
  bootstrapped: false,
  selectedHero: null,
  deployError: null,
  pendingHeroes: [],
  sessionError: null,
  connectionLost: true,
  demoMode: false,
  stageValidating: false,
  stageValidated: false,
  lastMintTxHash: null,
  lastWithdrawalTxHash: null,
  lastMintTx: null,
  hydrate: ({ player, heroes }) =>
    set({
      wallet: player.wallet,
      coins: player.coins,
      stage: player.stage,
      roster: heroes,
      bootstrapped: true,
    }),
  hydrateFromServer: (coins, stage) => set({ coins, stage }),
  hydrateRoster: (roster) => set({ roster }),
  reconcile: (patch) => set(patch),
  setSettlement: (type, txHash, tx) =>
    set(
      type === "mint"
        ? { lastMintTxHash: txHash, lastMintTx: tx ?? null }
        : { lastWithdrawalTxHash: txHash },
    ),
  setMapHeroes: (mapHeroes) => set({ mapHeroes }),
  setPaused: (gamePaused) => set({ gamePaused }),
  selectHero: (selectedHero) => set({ selectedHero }),
  setDeployError: (deployError) => set({ deployError }),
  setPendingHeroes: (pendingHeroes) => set({ pendingHeroes }),
  removeFromRoster: (id) =>
    set((state) => ({ roster: state.roster.filter((hero) => hero.id !== id) })),
  setStageValidating: (stageValidating) => set({ stageValidating }),
  setStageValidated: (stageValidated) => set({ stageValidated }),
  setSessionError: (sessionError) => set({ sessionError }),
  setConnectionLost: (connectionLost) => set({ connectionLost }),
  setDemoMode: (demoMode) => set({ demoMode }),
}));
