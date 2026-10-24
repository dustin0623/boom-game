import { create } from "zustand";

export const useWorkerStore = create<{
  available: boolean | null;
  reason: string;
  set: (available: boolean | null, reason: string) => void;
}>((set) => ({
  available: null,
  reason: "checking",
  set: (available, reason) => set({ available, reason }),
}));
