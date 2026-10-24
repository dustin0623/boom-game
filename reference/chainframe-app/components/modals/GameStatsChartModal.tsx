"use client";
import { useState } from "react";
import { Root as Dialog } from "@radix-ui/react-dialog";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GAME_STATS_DEFINITIONS } from "@/lib/api/types";
import type { GameStatsMetric } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";
import { GameStatsData } from "@/components/game/GameStatsData";
import { DailyStatsChart } from "@/components/game/DailyStatsChart";

export function GameStatsChartModal({
  metric,
  onClose,
  onRestoreFocus,
}: {
  metric: GameStatsMetric;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [series, setSeries] = useState(0);
  const definition = GAME_STATS_DEFINITIONS[metric];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto rounded-lg p-4 sm:p-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{definition.label}</DialogTitle>
          <DialogDescription>
            Daily completed game activity. Dates are in UTC.
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Chart period"
        >
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`min-h-10 rounded-md border px-3 text-sm ${days === value ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              {value} days
            </button>
          ))}
        </div>
        {definition.series.length > 1 ? (
          <label className="flex items-center gap-3 text-xs text-muted-foreground">
            Series
            <select
              className="min-h-10 rounded-md border border-border bg-background px-2 text-foreground"
              value={series}
              onChange={(event) => setSeries(Number(event.target.value))}
            >
              {definition.series.map((entry, i) => (
                <option key={entry.label} value={i}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <GameStatsData metric={metric} days={days}>
          {({ data, loading, unavailable, stale, refresh }) => {
            const daily = data?.kind === "daily" ? data : undefined;
            return (
              <>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {daily
                      ? `${daily.points[0].day} to ${daily.points[daily.points.length - 1].day} UTC`
                      : "Daily activity"}
                  </span>
                  <button
                    type="button"
                    className="min-h-9 rounded px-2 hover:text-foreground"
                    onClick={refresh}
                  >
                    {unavailable ? "Retry" : "Refresh"}
                  </button>
                </div>
                {loading ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {daily ? "Updating graph..." : "Loading graph..."}
                  </p>
                ) : null}
                {unavailable || stale ? (
                  <p role="alert" className="text-xs text-destructive">
                    {daily
                      ? `Showing saved ${daily.days}-day data. ${unavailable ? "The graph could not be refreshed." : "Loading the selected period."}`
                      : "The graph is unavailable. Please retry."}
                  </p>
                ) : null}
                {daily ? (
                  <>
                    <DailyStatsChart
                      key={`${daily.metric}-${daily.days}-${series}`}
                      data={daily}
                      series={series}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Today - partial. Only completed outcomes are included.
                      Updated {formatRelativeTime(daily.asOf)}.
                    </p>
                  </>
                ) : null}
              </>
            );
          }}
        </GameStatsData>
      </DialogContent>
    </Dialog>
  );
}
