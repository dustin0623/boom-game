import {
  LEADERBOARD_WEIGHTS,
  type LeaderboardDto,
  type LeaderboardEntryDto,
} from "@/lib/api/types";
import { DEFAULT_AVATAR_TEMPLATE_ID } from "@/features/types/game/templates";
import { currentMiningPerSecond } from "@/features/types/game/mining";
import { levelFromXp } from "@/features/types/game/level";

type RankingInput = Parameters<typeof currentMiningPerSecond>[0] & {
  wallet: string;
  username: string;
  equippedAvatarId: number | null;
  xp: number;
  notoriety: number;
};
export type LeaderboardSnapshot = {
  asOf: number;
  entries: LeaderboardEntryDto[];
};

/** Normalize against each category's leader across all registered inputs before pagination. */
export function createLeaderboardAccumulator(asOf: number) {
  const players: Array<
    Omit<LeaderboardEntryDto, "rank" | "score" | "points"> & {
      values: LeaderboardEntryDto["points"];
    }
  > = [];
  const leaders = { notoriety: 0, mining: 0, progression: 0 };
  return {
    accept(player: RankingInput) {
      const scores = {
        notoriety: player.notoriety,
        mining: currentMiningPerSecond(player, asOf),
        progression: player.xp,
      };
      if (
        !player.wallet ||
        Object.values(scores).some(
          (value) => !Number.isFinite(value) || value < 0,
        )
      )
        throw new Error("Invalid ranking input");
      for (const category of Object.keys(leaders) as Array<
        keyof typeof leaders
      >)
        leaders[category] = Math.max(leaders[category], scores[category]);
      players.push({
        username: player.wallet,
        avatarTemplateId: player.equippedAvatarId ?? DEFAULT_AVATAR_TEMPLATE_ID,
        level: levelFromXp(player.xp),
        miningLevel: player.statLevels.hashRate,
        notoriety: player.notoriety,
        xp: player.xp,
        values: scores,
      });
    },
    finish(): LeaderboardSnapshot {
      const rows = players.map(({ values, ...identity }) => {
        const points = { notoriety: 0, mining: 0, progression: 0 };
        for (const category of Object.keys(points) as Array<
          keyof typeof points
        >)
          points[category] =
            leaders[category] > 0
              ? (values[category] / leaders[category]) *
                LEADERBOARD_WEIGHTS[category]
              : 0;
        return {
          ...identity,
          rank: 0,
          points,
          score: points.notoriety + points.mining + points.progression,
        };
      });
      rows.sort(
        (a, b) =>
          b.score - a.score ||
          (a.username < b.username ? -1 : a.username > b.username ? 1 : 0),
      );
      for (let index = 0; index < rows.length; index++)
        rows[index].rank =
          index > 0 && rows[index - 1].score === rows[index].score
            ? rows[index - 1].rank
            : index + 1;
      return { asOf, entries: rows };
    },
  };
}

export function toLeaderboardDto(
  snapshot: LeaderboardSnapshot,
  page: number,
  wallet: string,
): LeaderboardDto {
  const rows = snapshot.entries;
  const displayedPlayers = Math.min(100, rows.length);
  return {
    ok: true,
    weights: LEADERBOARD_WEIGHTS,
    asOf: snapshot.asOf,
    registeredPlayers: rows.length,
    displayedPlayers,
    page,
    pageSize: 25,
    pageCount: Math.ceil(displayedPlayers / 25),
    entries: rows.slice((page - 1) * 25, Math.min(page * 25, displayedPlayers)),
    self: rows.find((row) => row.username === wallet) ?? null,
  };
}
