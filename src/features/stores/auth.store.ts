import { create } from "zustand";
import type { Player } from "@/features/types/auth.types";

type AuthState = {
  player: Player | null;
  setPlayer: (p: Player | null) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  player: null,
  setPlayer: (player) => set({ player }),
  logout: () => set({ player: null }),
}));
