import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Player audio/VFX preferences, saved in this browser only. */
interface SettingsState {
  soundOn: boolean;
  /** Bomb explosion volume, 0–100. Default 50 matches the original level. */
  bombVolume: number;
  setSoundOn: (on: boolean) => void;
  setBombVolume: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      bombVolume: 50,
      setSoundOn: (soundOn) => set({ soundOn }),
      setBombVolume: (v) => set({ bombVolume: Math.max(0, Math.min(100, Math.round(v))) }),
    }),
    {
      name: "game-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ soundOn: s.soundOn, bombVolume: s.bombVolume }),
    },
  ),
);
