import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  getFixtureRepositories,
  resetFixtureRepositories,
} from "@/tests/fixtures/persistence/index";
import {
  getFixtureState,
  resetFixtureDatabase,
  seedFixturePlayer,
  fixtureTransaction,
} from "@/tests/fixtures/persistence/store";
import { DatabaseOperationUncertainError } from "@/lib/utils/database/operation.server";
beforeEach(() => {
  resetFixtureDatabase();
  resetFixtureRepositories();
});
afterEach(() => vi.restoreAllMocks());
describe("test fixture integrity", () => {
  it("resets backing state, repository caches, counters and lease data", () => {
    const previous = getFixtureRepositories();
    seedFixturePlayer({ wallet: "alice" });
    const state = getFixtureState();
    state.nextItemId = 9;
    state.nextLogId = 8;
    state.gameStreamLease = { owner: "test", expiresAt: 10 };
    resetFixtureDatabase();
    resetFixtureRepositories();
    expect(getFixtureRepositories()).not.toBe(previous);
    const fresh = getFixtureState();
    for (const data of [
      fresh.players,
      fresh.equipments,
      fresh.stacks,
      fresh.gameStats,
      fresh.gameEvents,
    ])
      expect(data.size).toBe(0);
    expect(fresh.logs).toEqual([]);
    expect([fresh.nextItemId, fresh.nextLogId, fresh.gameStreamLease]).toEqual([
      1,
      1,
      null,
    ]);
  });
  it("returns independent snapshots of nested player state", async () => {
    seedFixturePlayer({ wallet: "alice" });
    const db = getFixtureRepositories();
    const snapshot = (await db.players.findByWallet("alice"))!;
    snapshot.statLevels.hashRate = 99;
    await db.items.grant("alice", "help-kit", 1);
    const stacks = await db.items.listByWallet("alice");
    stacks[0].quantity = 4;
    expect((await db.players.findByWallet("alice"))?.statLevels.hashRate).toBe(
      1,
    );
    expect(await db.items.quantity("alice", "help-kit")).toBe(1);
  });
  it("seeds stable valid defaults without sharing nested state", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const first = seedFixturePlayer({ wallet: "alice" }),
      second = seedFixturePlayer({ wallet: "bob" });
    expect(first).toMatchObject({
      wallet: "alice",
      username: "alice",
      hash: 0,
      sparks: 0,
      vault: 0,
      level: 1,
      isRegistered: false,
      lastTickAt: 1000,
    });
    expect(Object.values(first.statLevels)).toEqual([1, 1, 1, 1, 1, 1]);
    first.statLevels.hashRate = 50;
    expect(second.statLevels.hashRate).toBe(1);
  });
  it("joins nested operations and releases the queue after a read-only failure", async () => {
    const error = new Error("rejected before writing"),
      order: string[] = [];
    await expect(
      fixtureTransaction(async () => {
        order.push("outer");
        await fixtureTransaction(async () => {
          order.push("nested");
        });
        throw error;
      }),
    ).rejects.toBe(error);
    await fixtureTransaction(async () => {
      order.push("next");
    });
    expect(order).toEqual(["outer", "nested", "next"]);
  });
  it("retains failed writes and reports uncertainty without pretending to roll back", async () => {
    seedFixturePlayer({ wallet: "alice" });
    const cause = new Error("interrupted");
    const operation = fixtureTransaction(async () => {
      await getFixtureRepositories().players.creditHash("alice", 7);
      throw cause;
    });
    await expect(operation).rejects.toMatchObject({
      name: "DatabaseOperationUncertainError",
      cause,
    });
    expect(
      (await getFixtureRepositories().players.findByWallet("alice"))?.hash,
    ).toBe(7);
    await fixtureTransaction(async () => {
      await getFixtureRepositories().players.creditHash("alice", 1);
    });
    expect(
      (await getFixtureRepositories().players.findByWallet("alice"))?.hash,
    ).toBe(8);
    await expect(operation).rejects.toBeInstanceOf(
      DatabaseOperationUncertainError,
    );
  });
});
