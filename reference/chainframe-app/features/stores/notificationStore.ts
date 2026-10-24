import { create } from "zustand";
import { MAX_ACTIVITY_ENTRIES } from "@/lib/config/constants/game";
import type { ActivityEntry } from "@/features/types/game/types";
const createId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface PushOptions {
  id?: string;
  at?: number;
  pvp?: boolean;
}
interface NotificationState {
  activity: ActivityEntry[];
  push: (
    message: string,
    kind?: ActivityEntry["kind"],
    parts?: ActivityEntry["parts"],
    options?: PushOptions,
  ) => void;
  clear: () => void;
}
export const useNotificationStore = create<NotificationState>((set) => ({
  activity: [],
  push: (message, kind = "info", parts, options) =>
    set((state) => {
      if (
        options?.id &&
        state.activity.some((entry) => entry.id === options.id)
      )
        return state;
      return {
        activity: [
          {
            id: options?.id ?? createId("act"),
            message,
            kind,
            parts,
            at: options?.at ?? Date.now(),
            ...(options?.pvp ? { pvp: true } : {}),
          },
          ...state.activity,
        ].slice(0, MAX_ACTIVITY_ENTRIES),
      };
    }),
  clear: () => set({ activity: [] }),
}));
