import { create } from "zustand";
import { emptyStatBlock } from "@/features/types/game/stats";
import type { StatBlock } from "@/features/types/game/types";
import type { PublicStatEffects } from "@/features/types/game/stat-effects";
import type { PlayerDto } from "@/lib/api/types";
import * as api from "@/lib/api/client";
import { useAuthStore } from "@/features/stores/authStore";
export interface PlayerStats {
  wallet: number;
  /** Cumulative experience ever earned. Level is derived from this. */
  xp: number;
  /** Secondary currency, earned by salvaging gear and spent on gear upgrades. */
  sparks: number;
  vault: number;
  /** HASH staked into the vault (no levels). Drives capacity, Luck, Firewall. */
  vaultStaked: number;
  statLevels: StatBlock;
  stats: StatBlock;
  lastTickAt: number;
  /** Last HASH sink (upgrade or chest). Drives mining decay + raid charges. */
  lastSinkAt: number;
  claimCharges: number;
  lastClaimRegenAt: number;
  raidCharges: number;
  lastRaidRegenAt: number;
  milestones: {
    totalClaimed: number;
    totalMined: number;
    raids: number;
    raidWins: number;
    totalStolen: number;
    bestHashRate: number;
  };
  /** Permanent reputation earned through raids. Drives Exploit. */
  notoriety: number;
  /** Referral system */
  referralCount: number;
  referralEarned: number;
  /** Notoriety-gated withdrawal tracking. */
  withdrawnToday: number;
  withdrawResetAt: number;
  /** Active Sabotage effects on this player. Server-authoritative; read-only on the client. */
  statEffects: PublicStatEffects;
  /** Profile cosmetic template IDs (numeric) — default to 0/100/200 on registration. */
  avatar: number;
  banner: number;
  background: number;
}

const initialStatLevels = (): StatBlock => ({
  ...emptyStatBlock(),
  hashRate: 1,
  hackPower: 1,
  security: 1,
  luck: 1,
  firewall: 1,
  exploit: 1,
});

const initialState = (): PlayerStats => ({
  wallet: 0,
  xp: 0,
  sparks: 0,
  vault: 0,
  vaultStaked: 0,
  statLevels: initialStatLevels(),
  stats: { ...initialStatLevels(), hackPower: 10, security: 10, luck: 0 },
  lastTickAt: Date.now(),
  lastSinkAt: Date.now(),
  claimCharges: 5,
  lastClaimRegenAt: Date.now(),
  raidCharges: 8,
  lastRaidRegenAt: Date.now(),
  milestones: {
    totalClaimed: 0,
    totalMined: 0,
    raids: 0,
    raidWins: 0,
    totalStolen: 0,
    bestHashRate: 1,
  },
  notoriety: 0,
  referralCount: 0,
  referralEarned: 0,
  withdrawnToday: 0,
  withdrawResetAt: 0,
  statEffects: {},
  avatar: 0,
  banner: 100,
  background: 200,
});

function dtoToState(dto: PlayerDto): PlayerStats {
  return {
    wallet: dto.hash ?? 0,
    xp: dto.xp,
    sparks: dto.sparks,
    vault: dto.vault,
    vaultStaked: dto.vaultStaked,
    statLevels: dto.statLevels,
    stats: dto.stats,
    lastTickAt: dto.lastTickAt,
    lastSinkAt: dto.lastSinkAt,
    claimCharges: dto.claimCharges,
    lastClaimRegenAt: dto.lastClaimRegenAt,
    raidCharges: dto.raidCharges,
    lastRaidRegenAt: dto.lastRaidRegenAt,
    milestones: {
      totalClaimed: dto.milestones?.totalClaimed ?? 0,
      totalMined: dto.milestones?.totalMined ?? 0,
      raids: dto.milestones?.raids ?? 0,
      raidWins: dto.milestones?.raidWins ?? 0,
      totalStolen: dto.milestones?.totalStolen ?? 0,
      bestHashRate: dto.milestones?.bestHashRate ?? 1,
    },
    notoriety: dto.notoriety,
    referralCount: dto.referralCount ?? 0,
    referralEarned: dto.referralEarned ?? 0,
    withdrawnToday: dto.withdrawnToday ?? 0,
    withdrawResetAt: dto.withdrawResetAt ?? 0,
    statEffects: dto.statEffects ?? {},
    // Cosmetic template IDs are resolved server-side from the player's profile.
    // Fall back to the soulbound defaults when nothing is equipped.
    avatar: dto.profile?.avatar ?? 0,
    banner: dto.profile?.banner ?? 100,
    background: dto.profile?.background ?? 200,
  };
}

export const usePlayerStore = create<
  PlayerStats & {
    loaded: boolean;
    error: string | null;
    syncFromApi: (dto?: PlayerDto) => Promise<boolean>;
    reset: () => void;
  }
>()((set) => ({
  ...initialState(),
  loaded: false,
  error: null,
  syncFromApi: async (dto) => {
    const session = useAuthStore.getState();
    if (session.mode !== "wallet" || !session.apiConnected || !session.address)
      return false;
    const response = dto
      ? { ok: true, player: dto, error: undefined }
      : await api.getMe();
    const source = response.player;
    const current = useAuthStore.getState();
    if (
      current.address !== session.address ||
      current.connectedAt !== session.connectedAt ||
      current.mode !== "wallet" ||
      !current.apiConnected
    )
      return false;
    if (!response.ok || !source) {
      set({ error: response.error ?? "Player data unavailable" });
      return false;
    }
    if (source.address !== session.address) return false;
    useAuthStore.setState({
      isRegistered: source.isRegistered,
      referredBy: source.referredBy ?? null,
    });
    set({ ...dtoToState(source), loaded: true, error: null });
    return true;
  },
  reset: () => set({ ...initialState(), loaded: false, error: null }),
}));
