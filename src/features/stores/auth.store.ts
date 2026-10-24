import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Player } from "@/features/types/auth.types";

type AuthState = {
  player: Player | null;
  setPlayer: (p: Player | null) => void;
  logout: () => void;
};

/** Persisted under "chainframe-auth"; read only after hydration (see useHydrated). */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      player: null,
      setPlayer: (player) => set({ player }),
      logout: () => set({ player: null }),
    }),
    { name: "chainframe-auth" },
  ),
);
