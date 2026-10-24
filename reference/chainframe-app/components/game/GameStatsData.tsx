"use client";
import useSWR from "swr";
import type { ReactNode } from "react";
import { useAuthStore } from "@/features/stores/authStore";
import { fetchGameStats } from "@/lib/api/client";
import type {
  GameStatsMetric,
  GameStatsSummaryDto,
  GameStatsDailyDto,
} from "@/lib/api/types";

type StatsKey = readonly [
  string,
  string,
  number | null,
  GameStatsMetric | "summary",
  7 | 30 | 90,
];
async function fetchSessionStats(key: StatsKey) {
  const data = await fetchGameStats({
    metric: key[3] === "summary" ? undefined : key[3],
    days: key[4],
    isCurrent: () => {
      const current = useAuthStore.getState();
      return (
        current.mode === "wallet" &&
        current.apiConnected === true &&
        current.address === key[1] &&
        current.connectedAt === key[2]
      );
    },
  });
  return { wallet: key[1], connectedAt: key[2], data };
}
export interface GameStatsDataState {
  data?: GameStatsSummaryDto | GameStatsDailyDto;
  loading: boolean;
  stale: boolean;
  unavailable: boolean;
  refresh: () => void;
}
/** Shared React/SWR lifecycle for Stats views; no timers or authoritative state. */
export function GameStatsData({
  metric,
  days = 30,
  children,
}: {
  metric?: GameStatsMetric;
  days?: 7 | 30 | 90;
  children: (state: GameStatsDataState) => ReactNode;
}) {
  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const mode = useAuthStore((state) => state.mode);
  const authenticated = useAuthStore((state) => state.apiConnected === true);
  const key: StatsKey | null =
    mode === "wallet" && authenticated && address
      ? ["game-stats", address, connectedAt, metric ?? "summary", days]
      : null;
  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR(key, fetchSessionStats, {
    refreshInterval: 0,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
    keepPreviousData: true,
    dedupingInterval: 5000,
  });
  const candidate =
    key && response?.wallet === address && response.connectedAt === connectedAt
      ? response.data
      : undefined;
  const data = metric
    ? candidate?.kind === "daily" && candidate.metric === metric
      ? candidate
      : undefined
    : candidate?.kind === "summary"
      ? candidate
      : undefined;
  return children({
    data,
    loading: !!key && !!isLoading,
    stale: !!data && (!!error || (data.kind === "daily" && data.days !== days)),
    unavailable: !key || !!error,
    refresh: () => {
      void mutate().catch(() => {});
    },
  });
}
