import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Player } from "@/features/types/auth.types";

type AuthState = {
  player: Player | null;
  /** Game-session token issued at login; required by game server functions. */
  token: string | null;
  setPlayer: (p: Player | null) => void;
  setSession: (p: Player, token: string) => void;
  logout: () => void;
};

/** Persisted under "chainframe-auth"; read only after hydration (see useHydrated). */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      player: null,
      token: null,
      setPlayer: (player) => set({ player }),
      setSession: (player, token) => set({ player, token }),
      logout: () => set({ player: null, token: null }),
    }),
    { name: "chainframe-auth" },
  ),
);
