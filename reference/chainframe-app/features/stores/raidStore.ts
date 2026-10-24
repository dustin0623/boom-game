import { create } from "zustand";
import type { Rival } from "@/features/types/game/types";
import { getRaidTargets } from "@/lib/api/client";
import { useAuthStore } from "./authStore";
let requestGeneration = 0;
interface RaidState {
  rivals: Rival[];
  scaledFor: number;
  loading: boolean;
  refreshRivals: (power: number) => Promise<void>;
  reset: () => void;
  startPolling: (power: number) => () => void;
}
export const useRaidStore = create<RaidState>()((set, get) => ({
  rivals: [],
  scaledFor: 0,
  loading: false,
  refreshRivals: async (power) => {
    const session = useAuthStore.getState();
    if (session.mode !== "wallet" || !session.apiConnected || get().loading)
      return;
    const generation = ++requestGeneration;
    set({ loading: true, scaledFor: power });
    try {
      const result = await getRaidTargets(power);
      const current = useAuthStore.getState();
      if (
        generation !== requestGeneration ||
        current.address !== session.address ||
        current.connectedAt !== session.connectedAt ||
        current.mode !== session.mode
      )
        return;
      if (result.ok) set({ rivals: result.rivals ?? [] });
    } finally {
      if (generation === requestGeneration) set({ loading: false });
    }
  },
  reset: () => {
    requestGeneration++;
    set({ rivals: [], scaledFor: 0, loading: false });
  },
  startPolling: (power) => {
    const refresh = () => {
      if (typeof document === "undefined" || !document.hidden)
        void get().refreshRivals(get().scaledFor || power);
    };
    refresh();
    const timer = setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      requestGeneration++;
      set({ loading: false });
    };
  },
}));
