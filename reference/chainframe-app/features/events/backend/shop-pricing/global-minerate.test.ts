import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFixtureRepositories,
  resetFixtureRepositories,
} from "@/tests/fixtures/persistence";
import {
  resetFixtureDatabase,
  seedFixturePlayer,
  getFixtureState,
} from "@/tests/fixtures/persistence/store";
import { registerPlayer } from "@/features/events/backend/player-lifecycle/register";
import { upgradeStat } from "@/features/events/backend/upgrade-stat/action";
describe("stored level-only global minerate", () => {
  it("ignores equipment references and effective-stat ticks or decay", async () => {
    seedFixturePlayer({ wallet: "a", isRegistered: true });
    const db = getFixtureRepositories();
    const player = (await db.players.findByWallet("a"))!;
    await db.players.setEquipment("a", "asicMiner", "gear");
    await db.players.applyTick("a", {
      vault: 10,
      stats: { ...player.stats, hashRate: 999 },
      lastTickAt: 10,
      milestones: { totalMined: 10, bestHashRate: 999 },
      version: 1,
    });
    await db.players.applyTick("a", {
      vault: 10,
      stats: { ...player.stats, hashRate: 0.01 },
      lastTickAt: 20,
      milestones: { totalMined: 10, bestHashRate: 999 },
      version: 2,
    });
    expect(await db.gameStats.get("globalMinerate")).toBe(1);
  });
  beforeEach(() => {
    resetFixtureRepositories();
    resetFixtureDatabase();
  });
  it("adds registration once and excludes unregistered players", async () => {
    seedFixturePlayer({ wallet: "a", hash: 3.5 });
    seedFixturePlayer({ wallet: "b" });
    expect(await registerPlayer("a", "tx-a")).toMatchObject({ changed: true, startingHash: 10, startingItems: [] });
    expect(await registerPlayer("a", "tx-again")).toMatchObject({ changed: false, startingHash: 0, startingItems: [] });
    expect(getFixtureState().players.get("a")).toMatchObject({
      hash: 13.5,
      xp: 0,
      sparks: 0,
      vault: 0,
      referralEarned: 0,
    });
    expect(getFixtureState().players.get("b")?.hash).toBe(0);
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      1,
    );
  });
  it("applies single and bulk level deltas without effective-stat contributions", async () => {
    const a = seedFixturePlayer({
      wallet: "a",
      isRegistered: true,
      hash: 1000,
    });
    a.stats.hashRate = 900;
    await upgradeStat("a", "hashRate", 1);
    await upgradeStat("a", "hashRate", 3);
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      5,
    );
    await upgradeStat("a", "hackPower", 2);
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      5,
    );
  });
  it("does not count failed upgrades", async () => {
    seedFixturePlayer({ wallet: "a", isRegistered: true });
    expect((await upgradeStat("a", "hashRate", 2)).ok).toBe(false);
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      1,
    );
  });
  it("retains direct registration writes and reports an interrupted sequence", async () => {
    seedFixturePlayer({ wallet: "a" });
    const db = getFixtureRepositories();
    await expect(
      db.transaction(async () => {
        await registerPlayer("a", "tx");
        throw new Error("receipt failed");
      }),
    ).rejects.toThrow();
    expect(getFixtureState().players.get("a")?.isRegistered).toBe(true);
    expect(getFixtureState().players.get("a")?.hash).toBe(10);
    expect(await db.gameStats.get("globalMinerate")).toBe(1);
  });
  it("reports audit failure without pretending levels, spending and totals rolled back", async () => {
    seedFixturePlayer({ wallet: "a", isRegistered: true, hash: 100 });
    vi.spyOn(getFixtureRepositories().logs, "create").mockRejectedValueOnce(
      new Error("audit failed"),
    );
    await expect(upgradeStat("a", "hashRate", 2)).rejects.toThrow(
      "operator review",
    );
    expect(getFixtureState().players.get("a")?.statLevels.hashRate).toBe(3);
    expect(getFixtureState().players.get("a")?.hash).toBe(95);
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      3,
    );
  });
  it("accumulates concurrent transactions and consistent overwritten fixtures", async () => {
    seedFixturePlayer({ wallet: "a", isRegistered: true, hash: 100 });
    seedFixturePlayer({ wallet: "b", isRegistered: true, hash: 100 });
    await Promise.all([
      upgradeStat("a", "hashRate", 2),
      upgradeStat("b", "hashRate", 3),
    ]);
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      7,
    );
    seedFixturePlayer({ wallet: "a", isRegistered: false });
    expect(await getFixtureRepositories().gameStats.get("globalMinerate")).toBe(
      4,
    );
  });
});
vi.mock("@/lib/modules/players/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/players/server.repository")
  >()),
  get playerRepository() {
    return getFixtureRepositories().players;
  },
}));
vi.mock("@/lib/modules/logs/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/logs/server.repository")>()),
  get logRepository() {
    return getFixtureRepositories().logs;
  },
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/game-stats/server.repository")
  >()),
  get gameStatsRepository() {
    return getFixtureRepositories().gameStats;
  },
}));
vi.mock("@/lib/utils/database/operation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/utils/database/operation.server")
  >()),
  withDatabasePreparation: (execute: () => Promise<unknown>) => execute(),
  withDatabaseOperation: (execute: () => Promise<unknown>) => {
    const fixtures = getFixtureRepositories();
    return fixtures.transaction ? fixtures.transaction(execute) : execute();
  },
}));
