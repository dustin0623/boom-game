"use client";
import { useEffect, useRef, useState } from "react";
import { Activity, BarChart3, Send, X } from "lucide-react";
import { GameStatsPanel } from "./GameStatsPanel";
import { GameStatsChartModal } from "@/components/modals/GameStatsChartModal";
import type { GameStatsMetric } from "@/lib/api/types";
import { PopoverContent } from "@/components/ui/popover";
import {
  Root as Popover,
  Trigger as PopoverTrigger,
} from "@radix-ui/react-popover";
import {
  useTransactionStore,
  transactionSessionKey,
} from "@/features/stores/transactionStore";
import { useAuthStore } from "@/features/stores/authStore";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GameActivityPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"submitted" | "stats">("stats");
  const [chart, setChart] = useState<{
    metric: GameStatsMetric;
    session: string;
  } | null>(null);
  const openingChart = useRef(false);
  const mounted = useRef(true);
  const restoreChart = useRef<{
    metric: GameStatsMetric;
    session: string;
  } | null>(null);
  const focusFrame = useRef<number | null>(null);
  const submitted = useTransactionStore((s) => s.submitted);
  const storeSession = useTransactionStore((s) => s.session);
  const latestSubmissionId = useTransactionStore((s) => s.latestSubmissionId);
  const seenSubmissionId = useRef(latestSubmissionId);
  const wallet = useAuthStore((s) => s.address);
  const connectedAt = useAuthStore((s) => s.connectedAt);
  const mode = useAuthStore((s) => s.mode);
  const session = transactionSessionKey({ address: wallet, connectedAt, mode });
  const entries = session && storeSession === session ? submitted : [];
  useEffect(() => {
    setOpen(false);
    setTab("stats");
    openingChart.current = false;
    setChart(null);
    restoreChart.current = null;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, [session]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  useEffect(() => {
    const isNew = seenSubmissionId.current !== latestSubmissionId;
    seenSubmissionId.current = latestSubmissionId;
    if (isNew && latestSubmissionId && session && storeSession === session) {
      restoreChart.current = null;
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      setChart(null);
      setTab("submitted");
      setOpen(true);
    }
  }, [latestSubmissionId, session, storeSession]);
  const link = (id: string | null) =>
    id ? (
      <a
        className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground hover:underline"
        href={`https://hivehub.dev/tx/${encodeURIComponent(id)}`}
        target="_blank"
        rel="noopener noreferrer"
        title={id}
      >
        {id.slice(0, 16)}…
      </a>
    ) : null;
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="game-activity-trigger"
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border bg-card px-3 py-2 shadow-lg transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen((value) => !value)}
            aria-label={
              entries.length
                ? `Game activity, ${entries.length} ongoing ${entries.length === 1 ? "submission" : "submissions"}`
                : "Game activity"
            }
            aria-expanded={open}
            aria-controls="game-activity-panel"
          >
            <Activity className="size-4" aria-hidden="true" />
            {entries.length ? (
              <span
                aria-hidden="true"
                className="min-w-5 rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary"
              >
                {entries.length}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          id="game-activity-panel"
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="flex max-h-[70vh] w-[min(24rem,calc(100vw-1.5rem))] flex-col p-0 lg:max-h-[600px]"
          aria-label="Game activity"
          onCloseAutoFocus={(event) => {
            if (openingChart.current) {
              event.preventDefault();
              openingChart.current = false;
            }
          }}
        >
          <div className="shrink-0 border-b border-border px-4 pb-0 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold">Game activity</p>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close activity"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Submitted transactions and game statistics.
            </p>
            <div
              className="mt-3 flex"
              role="tablist"
              aria-label="Game activity views"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const tabs = ["submitted", "stats"] as const;
                const next =
                  event.key === "Home"
                    ? "submitted"
                    : event.key === "End"
                      ? "stats"
                      : tabs[(tabs.indexOf(tab) + 1) % 2];
                setTab(next);
                document.getElementById(`activity-tab-${next}`)?.focus();
              }}
            >
              {(["submitted", "stats"] as const).map((key) => (
                <button
                  key={key}
                  id={`activity-tab-${key}`}
                  role="tab"
                  tabIndex={tab === key ? 0 : -1}
                  aria-selected={tab === key}
                  aria-controls={`activity-list-${key}`}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "relative flex min-h-11 flex-1 items-center justify-center gap-1.5 pb-2.5 text-[12px] font-medium transition-colors",
                    tab === key
                      ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:bg-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {key === "submitted" ? (
                    <Send className="size-3.5" />
                  ) : (
                    <BarChart3 className="size-3.5" />
                  )}
                  {key === "submitted" ? "Submitted" : "Stats"}
                  {key === "submitted" && entries.length ? (
                    <span className="text-[10px] text-primary">
                      {entries.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <div
            id={`activity-list-${tab}`}
            role="tabpanel"
            aria-labelledby={`activity-tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {tab === "stats" ? (
              <GameStatsPanel
                onChart={(metric) => {
                  if (
                    !mounted.current ||
                    !session ||
                    transactionSessionKey(useAuthStore.getState()) !== session
                  )
                    return;
                  openingChart.current = true;
                  restoreChart.current = null;
                  setChart({ metric, session });
                  setOpen(false);
                }}
              />
            ) : (
              <>
                <ul
                  className="space-y-2"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-2.5 rounded-md px-1 py-1 text-[13px]"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          entry.status === "unknown"
                            ? "bg-danger"
                            : "bg-amber-500",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span>{entry.label}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {entry.status === "unknown"
                            ? "Submission outcome uncertain"
                            : entry.status === "delayed"
                              ? "Taking longer than expected"
                              : "Broadcast submitted"}
                        </span>
                        {link(entry.transactionId)}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(entry.submittedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                {!entries.length ? (
                  <p className="px-1 py-8 text-center text-[13px] text-muted-foreground">
                    No ongoing submissions. Completed outcomes appear in Recent
                    history.
                  </p>
                ) : null}
              </>
            )}
          </div>
          <footer className="flex items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              {tab === "stats"
                ? "Global game statistics"
                : "Awaiting backend confirmation."}
            </span>
            {tab === "stats" ? (
              <span className="shrink-0">UTC dates</span>
            ) : null}
          </footer>
        </PopoverContent>
      </Popover>
      {chart && chart.session === session ? (
        <GameStatsChartModal
          key={`${chart.session}-${chart.metric}`}
          metric={chart.metric}
          onClose={() => {
            if (
              !mounted.current ||
              transactionSessionKey(useAuthStore.getState()) !==
                chart.session ||
              useTransactionStore.getState().latestSubmissionId !==
                latestSubmissionId
            )
              return;
            restoreChart.current = chart;
            setChart(null);
            setTab("stats");
            setOpen(true);
          }}
          onRestoreFocus={() => {
            const target = restoreChart.current;
            restoreChart.current = null;
            if (
              !mounted.current ||
              !target ||
              transactionSessionKey(useAuthStore.getState()) !== target.session
            )
              return;
            focusFrame.current = requestAnimationFrame(() => {
              if (
                mounted.current &&
                transactionSessionKey(useAuthStore.getState()) ===
                  target.session
              ) {
                document.getElementById(`game-stat-${target.metric}`)?.focus();
              }
              focusFrame.current = null;
            });
          }}
        />
      ) : null}
    </div>
  );
}
