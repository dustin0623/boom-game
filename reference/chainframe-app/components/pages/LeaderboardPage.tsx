"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { LevelBadge } from "@/components/game/PlayerLevelHeader";
import { useAuthStore } from "@/features/stores/authStore";
import { fetchLeaderboard } from "@/lib/api/client";
import { formatHash, formatInt, formatRelativeTime } from "@/lib/format";
import {
  getAvatarByTemplateId,
  DEFAULT_AVATAR_TEMPLATE_ID,
} from "@/features/types/game/templates";

type LeaderboardKey = readonly [string, string, number | null, number];
async function fetchSessionLeaderboard(key: LeaderboardKey) {
  const data = await fetchLeaderboard({
    page: key[3],
    isCurrent: () => {
      const state = useAuthStore.getState();
      return (
        state.mode === "wallet" &&
        state.apiConnected === true &&
        state.address === key[1] &&
        state.connectedAt === key[2]
      );
    },
  });
  return { wallet: key[1], connectedAt: key[2], data };
}
export function LeaderboardPage() {
  const [page, setPage] = useState(1);
  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const mode = useAuthStore((state) => state.mode);
  const authenticated = useAuthStore((state) => state.apiConnected === true);
  const registered = useAuthStore((state) => state.isRegistered);
  const key: LeaderboardKey | null =
    mode === "wallet" && authenticated && address
      ? ["leaderboard", address, connectedAt, page]
      : null;
  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR(key, fetchSessionLeaderboard, {
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
  const data = candidate?.page === page ? candidate : undefined;
  useEffect(() => {
    if (data && page > Math.max(1, data.pageCount))
      setPage(Math.max(1, data.pageCount));
  }, [data, page]);
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Leaderboard"
        description="Top 100 registered players, ranked by Notoriety, mining and experience."
      >
        <Button
          variant="outline"
          disabled={!key || isLoading}
          onClick={() => {
            void mutate().catch(() => {});
          }}
        >
          Refresh
        </Button>
      </PageHeader>
      {data ? (
        <>
          {error && (
            <p role="status" className="text-sm text-destructive">
              Leaderboard refresh failed. Showing stale data; use Refresh to
              retry.
            </p>
          )}
          <div className="card-soft p-4" aria-label="Your rank">
            <p className="text-xs uppercase text-muted-foreground">Your rank</p>
            <p className="mt-1 font-semibold">
              {data.self
                ? `#${formatInt(data.self.rank)}`
                : registered === false
                  ? "Register to enter the rankings."
                  : "Your ranking is not available in this snapshot. Refresh after registration."}
            </p>
          </div>
          <div className="card-soft min-w-0 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">
                Combined leaderboard, page {page}
              </caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3">
                    Rank
                  </th>
                  <th scope="col" className="p-3">
                    Player
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right"
                    title="Hash Rate level"
                  >
                    Minerate
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Notoriety
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Experience
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const avatar =
                    getAvatarByTemplateId(entry.avatarTemplateId) ??
                    getAvatarByTemplateId(DEFAULT_AVATAR_TEMPLATE_ID);
                  return (
                    <tr
                      key={entry.username}
                      aria-current={
                        entry.username === address ? "true" : undefined
                      }
                      className={`border-b border-border last:border-0 ${entry.username === address ? "bg-primary/10" : ""}`}
                    >
                      <td className="p-3 tabular-nums">
                        {formatInt(entry.rank)}
                      </td>
                      <th scope="row" className="p-3 font-medium">
                        <span className="flex items-center gap-2">
                          {avatar && (
                            <Image
                              src={avatar.image}
                              width={28}
                              height={28}
                              alt=""
                              className="size-7 shrink-0 rounded-full"
                            />
                          )}
                          <span className="break-all">{entry.username}</span>
                          <LevelBadge xp={entry.xp} className="shrink-0" />
                        </span>
                      </th>
                      <td className="p-3 text-right font-mono tabular-nums">
                        {formatInt(entry.miningLevel)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        {formatHash(entry.notoriety, 4)}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right font-mono tabular-nums">
                        {formatInt(entry.xp)} XP
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.entries.length && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {data.registeredPlayers
                  ? "No players on this page."
                  : "No registered players yet."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
              {formatInt(data.registeredPlayers)} registered players · Updated{" "}
              {formatRelativeTime(data.asOf)}
            </p>
            <nav
              aria-label="Leaderboard pages"
              className="flex items-center gap-2"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {Math.max(1, data.pageCount)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          </div>
        </>
      ) : (
        <p
          role="status"
          className="card-soft p-6 text-sm text-muted-foreground"
        >
          {error || !key
            ? "Leaderboard unavailable. Use Refresh to retry."
            : "Loading leaderboard…"}
        </p>
      )}
    </div>
  );
}
