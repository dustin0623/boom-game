"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { Root as Select, Value as SelectValue } from "@radix-ui/react-select";
import { History, RefreshCw } from "lucide-react";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/authStore";
import {
  getActivityLogs,
  getPersonalMarketHistory,
  getMarketSales,
} from "@/lib/api/client";
import type { LogDto, PersonalHistoryCategory } from "@/lib/api/types";
import { historiesEntry } from "@/lib/utils/logs/presentation";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Selection =
  Exclude<PersonalHistoryCategory, "all"> | "my-market" | "market-sales";
const selections: Record<Selection, string> = {
  claims: "Claims",
  raids: "Raids",
  "equipment-minted": "Equipment minted",
  salvage: "Salvage",
  "stat-upgrades": "Stat upgrades",
  "equipment-upgrades": "Equipment upgrades",
  social: "Help and sabotage",
  "deposits-withdrawals": "Deposits and withdrawals",
  "staking-registration": "Staking and registration",
  "my-market": "My marketplace activity",
  "market-sales": "All marketplace sales",
};
type HistoryKey = readonly ["histories", string, number | null, Selection];
type HistoryResult = { logs: LogDto[] };

function HistoryList({
  wallet,
  connectedAt,
  selection,
}: {
  wallet: string;
  connectedAt: number | null;
  selection: Selection;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<HistoryResult>(
      ["histories", wallet, connectedAt, selection] satisfies HistoryKey,
      async (key: HistoryKey) => {
        const isCurrent = () => {
          const session = useAuthStore.getState();
          return (
            active.current &&
            session.mode === "wallet" &&
            session.apiConnected === true &&
            session.address === key[1] &&
            session.connectedAt === key[2]
          );
        };
        if (!isCurrent()) throw new Error("Wallet session changed");
        const result =
          key[3] === "my-market"
            ? await getPersonalMarketHistory(100)
            : key[3] === "market-sales"
              ? await getMarketSales(100)
              : await getActivityLogs(100, undefined, "older", key[3]);
        if (!isCurrent()) throw new Error("Wallet session changed");
        if (!result.ok || !Array.isArray(result.logs))
          throw new Error(result.error ?? "History unavailable");
        return { logs: result.logs };
      },
      {
        refreshInterval: 0,
        revalidateOnFocus: true,
        shouldRetryOnError: false,
        keepPreviousData: false,
        dedupingInterval: 5000,
      },
    );
  const unique = new Map<string, LogDto>();
  for (const log of data?.logs ?? []) {
    const id = log.id ?? log._id;
    if (id && !unique.has(id)) unique.set(id, log);
  }
  const logs = [...unique.values()].slice(0, 100);
  return (
    <>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Latest 100 logs</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={isValidating}
          onClick={() => {
            void mutate().catch(() => {});
          }}
        >
          <RefreshCw
            className={cn("mr-1.5 size-3.5", isValidating && "animate-spin")}
          />
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isValidating}>
        {error && (
          <p
            role="status"
            className="mb-3 rounded-md border border-border p-3 text-sm text-muted-foreground"
          >
            {logs.length
              ? "History is stale. Refresh to try again."
              : "History unavailable. Refresh to try again."}
          </p>
        )}
        {!logs.length && !error && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {isLoading
              ? "Loading history…"
              : "No recorded activity for this selection."}
          </p>
        )}
        <ul className="divide-y divide-border/50">
          {logs.map((log) => {
            const entry = historiesEntry(
              log,
              wallet,
              selection === "market-sales",
            );
            return (
              <li
                key={entry.id}
                className="flex items-start gap-3 py-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    entry.kind === "success"
                      ? "bg-success"
                      : entry.kind === "danger"
                        ? "bg-danger"
                        : entry.kind === "loot"
                          ? "bg-accent"
                          : "bg-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 break-words">
                  {entry.parts
                    ? entry.parts.map((part, index) => (
                        <span key={index} className={part.className}>
                          {part.text}
                        </span>
                      ))
                    : entry.message}
                </span>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={new Date(entry.at).toISOString()}
                  title={new Date(entry.at).toLocaleString()}
                  aria-label={new Date(entry.at).toLocaleString()}
                >
                  {formatRelativeTime(entry.at)}
                </time>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function HistoriesContent({
  wallet,
  connectedAt,
}: {
  wallet: string;
  connectedAt: number | null;
}) {
  const [selection, setSelection] = useState<Selection>("claims");
  return (
    <>
      <Select
        value={selection}
        onValueChange={(value) => setSelection(value as Selection)}
      >
        <SelectTrigger aria-label="History category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(selections).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <HistoryList
        key={selection}
        wallet={wallet}
        connectedAt={connectedAt}
        selection={selection}
      />
    </>
  );
}

export function HistoriesModal({
  open,
  onClose,
  onRestoreFocus,
}: {
  open: boolean;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const wallet = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const mode = useAuthStore((state) => state.mode);
  const authenticated = useAuthStore((state) => state.apiConnected === true);
  const enabled = open && mode === "wallet" && authenticated && !!wallet;
  return (
    <Dialog
      open={enabled}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="flex h-[min(42rem,85dvh)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col rounded-lg p-4 sm:p-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Histories
          </DialogTitle>
          <DialogDescription>
            Browse recorded game activity and marketplace history.
          </DialogDescription>
        </DialogHeader>
        {enabled && (
          <HistoriesContent
            key={`${wallet}:${connectedAt}`}
            wallet={wallet!}
            connectedAt={connectedAt}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
