"use client";
import { BarChart3, RefreshCw } from "lucide-react";
import useSWR from "swr";
import { useAuthStore } from "@/features/stores/authStore";
import { fetchShopPrices } from "@/lib/api/client";
import { GAME_STATS_METRICS, GAME_STATS_DEFINITIONS } from "@/lib/api/types";
import type { GameStatsMetric } from "@/lib/api/types";
import {
  formatGameStatValue,
  formatHash,
  formatInt,
  formatMiningRate,
  formatRelativeTime,
} from "@/lib/format";
import { GameStatsData } from "./GameStatsData";

function fetchSessionPricing(key: readonly [string, string, number | null]) {
  return fetchShopPrices({
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
}

export function GameStatsPanel({
  onChart,
}: {
  onChart: (metric: GameStatsMetric) => void;
}) {
  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const mode = useAuthStore((state) => state.mode);
  const authenticated = useAuthStore((state) => state.apiConnected === true);
  const pricingKey =
    mode === "wallet" && authenticated && address
      ? (["shop-prices", address, connectedAt] as const)
      : null;
  const {
    data: prices,
    error: pricingError,
    isLoading: pricingLoading,
    mutate: refreshPricing,
  } = useSWR(pricingKey, fetchSessionPricing, {
    refreshInterval: 0,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
    keepPreviousData: false,
    dedupingInterval: 5000,
  });
  const pricing = pricingKey ? prices?.emission : undefined;
  return (
    <GameStatsData>
      {({ data, loading, unavailable, stale, refresh }) => {
        const summary = data?.kind === "summary" ? data : undefined;
        return (
          <div className="space-y-2 px-2 py-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {summary
                  ? `Updated ${formatRelativeTime(summary.asOf)}`
                  : "Global game statistics"}
              </span>
              <button
                type="button"
                onClick={() => {
                  refresh();
                  void refreshPricing().catch(() => {});
                }}
                className="flex min-h-8 items-center gap-1 rounded px-2 hover:text-foreground"
                aria-label="Refresh game statistics"
              >
                <RefreshCw className="size-3" />
                {unavailable || pricingError ? "Retry" : "Refresh"}
              </button>
            </div>
            {loading ? (
              <p role="status" className="text-xs text-muted-foreground">
                {summary ? "Updating statistics..." : "Loading statistics..."}
              </p>
            ) : null}
            {unavailable ? (
              <p role="alert" className="text-xs text-destructive">
                {stale
                  ? "Statistics could not be refreshed. Showing saved values."
                  : "Game statistics are unavailable. Please retry."}
              </p>
            ) : null}
            {summary ? (
              <>
                <dl className="space-y-3 rounded-md bg-muted/20 p-3 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt>Registered players</dt>
                    <dd className="font-mono">
                      {formatInt(summary.mining.registeredPlayers)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Global mining rate</dt>
                    <dd className="text-right font-mono">
                      {formatMiningRate(summary.mining.hashPerSecond)} HASH/s
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Emission at current rates</dt>
                    <dd className="text-right font-mono">
                      {formatHash(summary.mining.hashPerDay)} HASH/day
                    </dd>
                  </div>
                </dl>
                <p className="text-[11px] text-muted-foreground">
                  Potential output at current rates, independent of vault
                  fullness. Mining history is not stored.
                </p>
              </>
            ) : null}
            <dl className="rounded-md bg-muted/20 p-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt>Pricing excess</dt>
                <dd className="text-right font-mono">
                  {pricing
                    ? `${formatHash(pricing.excess, 4)} HASH/day`
                    : pricingLoading && pricingKey
                      ? "Loading…"
                      : "—"}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-muted-foreground">
              {pricing
                ? `Above the ${formatHash(pricing.threshold, 4)} HASH/day completed-day pricing threshold, based on recorded claims.`
                : "Pricing excess uses completed-day recorded claims, not current mining output."}
              {pricing && prices
                ? ` Updated ${formatRelativeTime(prices.asOf)}.`
                : ""}
            </p>
            {pricingError || (!pricing && !pricingLoading) ? (
              <p role="alert" className="text-[11px] text-destructive">
                {pricing
                  ? "Pricing excess could not be refreshed. Showing stale pricing."
                  : "Pricing excess is unavailable. Please retry."}
              </p>
            ) : null}
            {summary ? (
              <>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Lifetime completed activity
                </p>
                <div className="space-y-1">
                  {GAME_STATS_METRICS.map((metric) => {
                    const definition = GAME_STATS_DEFINITIONS[metric];
                    return (
                      <button
                        key={metric}
                        id={`game-stat-${metric}`}
                        type="button"
                        onClick={() => onChart(metric)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-1.5 py-2 text-left text-[13px] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`View daily ${definition.label}`}
                      >
                        <span>{definition.label}</span>
                        <span className="flex items-center gap-2 text-right">
                          <span className="font-mono">
                            {formatGameStatValue(
                              summary.totals[metric][0],
                              definition.series[0].unit,
                            )}
                          </span>
                          <BarChart3
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        );
      }}
    </GameStatsData>
  );
}
