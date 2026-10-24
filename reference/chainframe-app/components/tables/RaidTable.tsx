import { ArrowDown, ArrowUp, RefreshCw, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PlayerModal } from "@/components/modals/PlayerModal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  canRaid,
  raidSuccessChance,
  rivalOnCooldown,
} from "@/features/types/game/raid";

import { useGameActionFlow } from "@/hooks/useGameActionFlow";
import { buildRaidAction } from "@/lib/utils/game/action-protocol";
import { useGameStats } from "@/hooks/useGameStats";
import { formatHash, formatCountdown, formatPercent } from "@/lib/format";
import { MAX_RAID_CHARGES } from "@/lib/config/constants/game";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

import { useRaidStore } from "@/features/stores/raidStore";
import type { Rival } from "@/features/types/game/types";

type RaidSortKey = "vault" | "chance" | "security" | "firewall";

const RAID_SORT_OPTIONS: [RaidSortKey, string][] = [
  ["vault", "Vault"],
  ["chance", "Chance"],
  ["security", "Security"],
  ["firewall", "Firewall"],
];

/** Battle board: rival list in a dense table, mirroring the reference layout. */
export function RaidTable() {
  const { total, vaultSpace, raids: raidChargeInfo } = useGameStats();
  const rivals = useRaidStore((state) => state.rivals);
  const loading = useRaidStore((state) => state.loading);
  const refreshRivals = useRaidStore((state) => state.refreshRivals);
  const startPolling = useRaidStore((state) => state.startPolling);
  const scaledFor = useRaidStore((state) => state.scaledFor);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<RaidSortKey>("vault");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [beatableOnly, setBeatableOnly] = useState(false);

  const flow = useGameActionFlow({
    onProcessed: () => {
      void refreshRivals(scaledFor || total.hackPower);

      flow.reset();
    },
  });
  const awaiting = flow.lifecycle === "broadcast";
  const selectedRival = rivals.find((rival) => rival.id === selectedId) ?? null;

  // Pre-compute each rival's raid chance/beatability once per render so both
  // the sort/filter pass and the row rendering share the same values.
  const enrichedRivals = useMemo(
    () =>
      rivals.map((rival) => ({
        rival,
        chance: raidSuccessChance(
          total.hackPower,
          rival.security,
          rival.firewall,
        ),
        beatable: canRaid(total.hackPower, rival.security),
      })),
    [rivals, total.hackPower],
  );

  const visibleRivals = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const list = beatableOnly
      ? enrichedRivals.filter((entry) => entry.beatable)
      : enrichedRivals;
    return [...list].sort((a, b) => {
      if (sort === "security")
        return (a.rival.security - b.rival.security) * dir;
      if (sort === "firewall")
        return (a.rival.firewall - b.rival.firewall) * dir;
      if (sort === "chance") return (a.chance - b.chance) * dir;
      return (a.rival.vault - b.rival.vault) * dir;
    });
  }, [enrichedRivals, beatableOnly, sort, sortDir]);

  const handleSort = (key: RaidSortKey) => {
    if (sort === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("desc");
    }
  };

  // Start polling on mount; restart if hack power changes materially.
  useEffect(() => {
    const stop = startPolling(total.hackPower);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total.hackPower]);

  // Manual refresh keeps scaledFor in sync without restarting the interval.
  const handleRefresh = () => refreshRivals(total.hackPower);

  const handleRaid = (rival: Rival) => {
    if (busy || awaiting) return;
    if (!canRaid(total.hackPower, rival.security)) {
      notify(
        `Your Hack Power is too low to breach ${rival.username}'s security`,
        "danger",
      );
      return;
    }
    if (rivalOnCooldown(rival)) {
      notify(
        `${rival.username} was just raided — try again in a minute`,
        "info",
      );
      return;
    }
    if (vaultSpace <= 0) {
      notify("Your vault is full — claim before raiding", "danger");
      return;
    }

    flow.reset();

    void executeRaid(rival);
  };

  const executeRaid = async (rival: Rival) => {
    if (!rival) return;
    setBusy(true);
    try {
      await flow.run({
        build: (nonce) => buildRaidAction({ target: rival.username, nonce }),
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedRaidBlockedReason = !selectedRival
    ? null
    : busy || awaiting
      ? "A raid is already in progress."
      : !canRaid(total.hackPower, selectedRival.security)
        ? "Your Hack Power is too low to breach this player's security."
        : rivalOnCooldown(selectedRival)
          ? "This player was just raided. Try again in a minute."
          : vaultSpace <= 0
            ? "Your vault is full. Claim before raiding."
            : null;

  return (
    <section className="space-y-3">
      {flow.errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {flow.errorMessage}
        </p>
      ) : null}
      {flow.lifecycle === "broadcasting" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Waiting for Hive Keychain approval…
        </p>
      ) : null}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            Raids
          </h2>
          <span className="hidden rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex sm:items-center sm:gap-2">
            <span className="font-semibold text-foreground">
              Charges: {raidChargeInfo.current}
            </span>
            <span className="opacity-60">/ {raidChargeInfo.max}</span>
            <span className="opacity-60">
              {raidChargeInfo.msUntilNext === null
                ? "charges full"
                : `next in ${formatCountdown(raidChargeInfo.msUntilNext)}`}
            </span>
            {raidChargeInfo.max < MAX_RAID_CHARGES ? (
              <span className="text-danger">
                cap {raidChargeInfo.max}/{MAX_RAID_CHARGES} — idle decay
              </span>
            ) : null}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={handleRefresh}
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          New targets
        </Button>
      </header>

      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground sm:hidden">
        <span className="font-semibold text-foreground">
          Charges: {raidChargeInfo.current}
        </span>
        <span className="opacity-60">/ {raidChargeInfo.max}</span>
        <span className="opacity-60">
          {raidChargeInfo.msUntilNext === null
            ? "charges full"
            : `next in ${formatCountdown(raidChargeInfo.msUntilNext)}`}
        </span>
      </span>

      <p className="text-xs text-muted-foreground">
        Estimated vaults include elapsed mining. The server determines actual
        amounts when the raid executes.
      </p>

      {/* Sort + filter controls */}
      {rivals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Sort by
            </span>
            {RAID_SORT_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSort(key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  sort === key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {sort === key ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : (
                    <ArrowDown className="size-3" />
                  )
                ) : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setBeatableOnly((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              beatableOnly
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <ShieldOff className="size-3.5" />
            Beatable only
          </button>
        </div>
      )}

      {/* Loading / empty state */}
      {loading && rivals.length === 0 && (
        <div className="card-soft flex items-center justify-center py-10 text-sm text-muted-foreground">
          <RefreshCw className="mr-2 size-4 animate-spin" />
          Finding targets…
        </div>
      )}
      {!loading && rivals.length === 0 && (
        <div className="card-soft flex items-center justify-center py-10 text-sm text-muted-foreground">
          No targets below your Hack Power right now — try again soon.
        </div>
      )}
      {!loading && rivals.length > 0 && visibleRivals.length === 0 && (
        <div className="card-soft flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <ShieldOff className="size-6 text-muted-foreground/60" />
          <p>No beatable targets in this batch.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBeatableOnly(false)}
          >
            Show all targets
          </Button>
        </div>
      )}

      {/* Mobile: card list — a table would clip the Raid action off-screen. */}
      {visibleRivals.length > 0 && (
        <div className="grid gap-2 sm:hidden">
          {visibleRivals.map(({ rival, chance, beatable }) => {
            return (
              <div key={rival.id} className="card-soft space-y-3 p-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(rival.id)}
                    className="flex min-w-0 items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="size-9 shrink-0 rounded-full bg-gradient-to-tr from-primary via-accent to-success p-[2px]">
                      <span className="grid size-full place-items-center overflow-hidden rounded-full border-2 border-card bg-secondary text-[11px] font-semibold text-primary-foreground">
                        {rival.username.slice(0, 2).toUpperCase()}
                      </span>
                    </span>
                    <span className="truncate font-medium">
                      {rival.username}
                    </span>
                  </button>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground">Estimated vault</p>
                    <p className="font-semibold tabular-nums text-primary">
                      {formatHash(rival.vault, 4, false)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Security</p>
                    <p className="tabular-nums">{formatHash(rival.security)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Firewall</p>
                    <p className="tabular-nums">
                      {formatPercent(rival.firewall)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Chance</p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        chance >= 65
                          ? "text-success"
                          : chance >= 40
                            ? "text-primary"
                            : "text-danger",
                      )}
                    >
                      {formatPercent(chance)}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  variant={beatable ? "default" : "secondary"}
                  disabled={
                    busy ||
                    flow.unavailable ||
                    awaiting ||
                    !beatable ||
                    rivalOnCooldown(rival)
                  }
                  onClick={() => handleRaid(rival)}
                >
                  Raid
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {visibleRivals.length > 0 && (
        <div className="card-soft hidden overflow-x-auto p-0 sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Player</TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("security")}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      sort === "security" && "text-primary",
                    )}
                  >
                    Security
                    {sort === "security" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("firewall")}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      sort === "firewall" && "text-primary",
                    )}
                  >
                    Firewall
                    {sort === "firewall" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("chance")}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      sort === "chance" && "text-primary",
                    )}
                  >
                    Chance
                    {sort === "chance" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("vault")}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      sort === "vault" && "text-primary",
                    )}
                  >
                    Estimated vault
                    {sort === "vault" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                </TableHead>
                <TableHead className="pr-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRivals.map(({ rival, chance, beatable }) => {
                return (
                  <TableRow key={rival.id}>
                    <TableCell className="pl-4">
                      <button
                        type="button"
                        onClick={() => setSelectedId(rival.id)}
                        className="flex min-w-0 items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="size-9 shrink-0 rounded-full bg-gradient-to-tr from-primary via-accent to-success p-[2px]">
                          <span className="grid size-full place-items-center overflow-hidden rounded-full border-2 border-card bg-secondary text-[11px] font-semibold text-primary-foreground">
                            {rival.username.slice(0, 2).toUpperCase()}
                          </span>
                        </span>
                        <span className="truncate font-medium underline-offset-4 hover:underline">
                          {rival.username}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHash(rival.security)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPercent(rival.firewall)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        chance >= 65
                          ? "text-success"
                          : chance >= 40
                            ? "text-primary"
                            : "text-danger",
                      )}
                    >
                      {formatPercent(chance)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-primary">
                      {formatHash(rival.vault, 4, false)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        size="sm"
                        variant={beatable ? "default" : "secondary"}
                        disabled={
                          busy ||
                          flow.unavailable ||
                          !beatable ||
                          rivalOnCooldown(rival)
                        }
                        onClick={() => handleRaid(rival)}
                      >
                        Raid
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PlayerModal
        rival={selectedRival}
        open={selectedRival !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onRaid={handleRaid}
        raidBlockedReason={selectedRaidBlockedReason}
        onSocialApplied={() => refreshRivals(scaledFor || total.hackPower)}
      />
    </section>
  );
}
