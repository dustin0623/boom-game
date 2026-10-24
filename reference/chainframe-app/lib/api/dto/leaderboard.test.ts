import { describe, expect, it } from "vitest";
import { createLeaderboardAccumulator, toLeaderboardDto } from "./leaderboard";
const now = Date.parse("2026-10-14T12:00:00Z");
const player = (wallet: string, notoriety = 0, xp = 0, hashRate = 1) => ({
  wallet,
  username: wallet,
  xp,
  notoriety,
  equippedAvatarId: null,
  statLevels: { hashRate },
  lastSinkAt: now,
  hash: 900,
  vault: 999,
  loginNonce: "private",
});
describe("combined leaderboard scoring", () => {
  it("awards 30/30/40 to category leaders and the agreed 63-point proportional example", () => {
    const a = createLeaderboardAccumulator(now);
    a.accept(player("leader", 100, 1000, 5));
    a.accept(player("follower", 50, 600, Math.sqrt(28.8) - 1));
    const rows = a.finish().entries;
    expect(rows[0]).toMatchObject({
      username: "leader",
      miningLevel: 5,
      notoriety: 100,
      xp: 1000,
      level: 2,
      score: 100,
      points: { notoriety: 30, mining: 30, progression: 40 },
    });
    expect(rows[1].points.notoriety).toBe(15);
    expect(rows[1].points.mining).toBeCloseTo(24, 12);
    expect(rows[1].points.progression).toBe(24);
    expect(rows[1].score).toBeCloseTo(63, 12);
  });
  it("uses independent category leaders rather than the combined top player's values", () => {
    const a = createLeaderboardAccumulator(now);
    a.accept(player("notoriety-leader", 100, 0, 0));
    a.accept(player("mining-leader", 0, 0, 5));
    a.accept(player("xp-leader", 0, 1000, 0));
    a.accept(player("balanced", 50, 500, 3));
    const rows = a.finish().entries;
    expect(rows[0].username).toBe("balanced");
    expect(rows[0].score).toBeCloseTo(48.33333333333333, 12);
    expect(rows[0].score).toBeLessThan(100);
    expect(
      rows.find((row) => row.username === "notoriety-leader")!.points.notoriety,
    ).toBe(30);
    expect(
      rows.find((row) => row.username === "mining-leader")!.points.mining,
    ).toBe(30);
    expect(
      rows.find((row) => row.username === "xp-leader")!.points.progression,
    ).toBe(40);
  });
  it("shares exact ties and ranks full precision even when displayed values would match", () => {
    const a = createLeaderboardAccumulator(now);
    a.accept(player("bob", 5));
    a.accept(player("alice", 5));
    a.accept(player("cara", 4.0000002));
    a.accept(player("dan", 4.0000001));
    const rows = a.finish().entries;
    expect(rows.map(({ username, rank }) => [username, rank])).toEqual([
      ["alice", 1],
      ["bob", 1],
      ["cara", 3],
      ["dan", 4],
    ]);
    expect(rows[2].score).toBeGreaterThan(rows[3].score);
    expect(rows[2].score.toFixed(4)).toBe(rows[3].score.toFixed(4));
  });
  it("does not redistribute empty-category points and divides before multiplying to avoid overflow", () => {
    const empty = createLeaderboardAccumulator(now);
    empty.accept(player("alice"));
    expect(empty.finish().entries[0]).toMatchObject({
      score: 30,
      points: { notoriety: 0, mining: 30, progression: 0 },
    });
    const huge = createLeaderboardAccumulator(now);
    huge.accept(player("alice", Number.MAX_VALUE, Number.MAX_VALUE));
    expect(huge.finish().entries[0].score).toBe(100);
  });
  it("preserves individual mining softcap, decay and active effects at the captured time", () => {
    const a = createLeaderboardAccumulator(now);
    const base = player("base", 0, 0, 1000);
    a.accept(base);
    a.accept({
      ...base,
      wallet: "sabotaged",
      statEffects: {
        hashRate: {
          active: true,
          stat: "hashRate",
          itemId: "sabotage-device",
          appliedBy: "other",
          appliedAt: now,
          strength: 0.5,
          critical: false,
          helps: [],
        },
      },
    });
    a.accept({ ...base, wallet: "decayed", lastSinkAt: now - 100 * 86400000 });
    const rows = a.finish().entries;
    expect(rows.map((row) => row.username)).toEqual([
      "base",
      "sabotaged",
      "decayed",
    ]);
    expect(rows[0].points.mining).toBe(30);
    expect(rows[1].points.mining).toBeCloseTo((30 * 174306.25) / 445556.25, 12);
    expect(rows[2].points.mining).toBeCloseTo(8.47288609443, 10);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "avatarTemplateId",
      "level",
      "miningLevel",
      "notoriety",
      "points",
      "rank",
      "score",
      "username",
      "xp",
    ]);
    expect(rows.every((row) => row.miningLevel === 1000)).toBe(true);
  });
  it("uses the complete population before pagination and retains own rank beyond the first 100", () => {
    const a = createLeaderboardAccumulator(now);
    for (let index = 0; index < 251; index++)
      a.accept(
        player(`player-${index.toString().padStart(3, "0")}`, 251 - index),
      );
    const s = a.finish();
    const page = toLeaderboardDto(s, 4, "player-250");
    expect(page.entries).toHaveLength(25);
    expect(page.entries[0].rank).toBe(76);
    expect(page).toMatchObject({
      registeredPlayers: 251,
      displayedPlayers: 100,
      pageCount: 4,
      self: { rank: 251 },
    });
    expect(page.self!.score).toBeCloseTo(30 + 30 / 251, 12);
    expect(page.entries.some((row) => row.username === "player-250")).toBe(
      false,
    );
    expect(toLeaderboardDto(s, 1, "unregistered").self).toBeNull();
  });
  it("returns a valid empty result and rejects invalid scores instead of fabricating ranks", () => {
    expect(
      toLeaderboardDto(createLeaderboardAccumulator(now).finish(), 1, "alice"),
    ).toMatchObject({
      entries: [],
      self: null,
      registeredPlayers: 0,
      pageCount: 0,
    });
    expect(() =>
      createLeaderboardAccumulator(now).accept(player("bad", NaN)),
    ).toThrow("Invalid ranking input");
  });
});
