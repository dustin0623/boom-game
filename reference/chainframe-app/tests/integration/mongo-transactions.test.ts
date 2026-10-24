import { beforeEach, describe, expect, it, vi } from "vitest";
const { transaction } = vi.hoisted(() => ({
  transaction: vi.fn(async (execute: () => Promise<unknown>) => execute()),
}));
vi.mock("@/lib/config/database", () => ({
  connectDatabase: vi.fn(async () => ({ connection: { transaction } })),
}));
import { withDatabaseOperation } from "@/lib/utils/database/operation.server";
const createMongoDatabase = () => ({ transaction: withDatabaseOperation });
import { PlayerModel } from "@/lib/modules/players/server.model";
import { markPlayerRegistered } from "@/lib/modules/players/server.repository";
import { GameStatModel } from "@/lib/modules/game-stats/server.model";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
const createMongoGameStatRepository = () => gameStatsRepository;
import { createFixtureGameStatRepository } from "@/tests/fixtures/persistence/game-stat-repository";
import { resetFixtureDatabase } from "@/tests/fixtures/persistence/store";
beforeEach(() => {
  vi.restoreAllMocks();
  transaction.mockClear();
  resetFixtureDatabase();
});
describe("Mongo direct operation boundary", () => {
  it("runs nested events without sessions and propagates errors before writes", async () => {
    const db = createMongoDatabase();
    await expect(
      db.transaction(() =>
        db.transaction(async () => {
          throw new Error("receipt failed");
        }),
      ),
    ).rejects.toThrow("receipt failed");
    expect(transaction).not.toHaveBeenCalled();
    await db.transaction(async () => {});
    expect(transaction).not.toHaveBeenCalled();
  });
  it("conditionally registers and returns only a level-based contribution once", async () => {
    let registered = false;
    const calls = vi
      .spyOn(PlayerModel, "findOneAndUpdate")
      .mockImplementation((async (filter: Record<string, unknown>) => {
        if (filter.isRegistered) {
          if (registered) return null;
          registered = true;
        }
        return { statLevels: { hashRate: 7 }, stats: { hashRate: 999 } };
      }) as never);
    expect(await markPlayerRegistered("alice", "tx", 10)).toEqual({
      changed: true,
      minerate: 7,
    });
    expect(await markPlayerRegistered("alice", "tx-again", 10)).toEqual({
      changed: false,
      minerate: 0,
    });
    expect(calls.mock.calls[1][0]).toMatchObject({
      wallet: "alice",
      isRegistered: { $ne: true },
    });
    expect(calls.mock.calls[1][1]).toMatchObject({
      $inc: { hash: 10 },
      $set: { isRegistered: true, registrationTxId: "tx" },
    });
  });
});
for (const [provider, create] of [
  ["mock", createFixtureGameStatRepository],
  ["mongodb", createMongoGameStatRepository],
] as const)
  describe(provider + " atomic global counter contract", () => {
    it("accumulates concurrent increments with atomic upserts", async () => {
      const values = new Map<string, number>();
      const update = vi
        .spyOn(GameStatModel, "updateOne")
        .mockImplementation((async (
          filter: Record<string, string>,
          operation: { $inc: { value: number } },
        ) => {
          values.set(
            filter._id,
            (values.get(filter._id) ?? 0) + operation.$inc.value,
          );
          return { matchedCount: 1 };
        }) as never);
      vi.spyOn(GameStatModel, "findById").mockImplementation(((
        key: string,
      ) => ({
        lean: async () => (values.has(key) ? { value: values.get(key) } : null),
      })) as never);
      const repository = create();
      await Promise.all([
        repository.increment("globalMinerate", 2),
        repository.increment("globalMinerate", 3),
      ]);
      expect(await repository.get("globalMinerate")).toBe(5);
      if (provider === "mongodb")
        expect(update).toHaveBeenCalledWith(
          { _id: "globalMinerate" },
          expect.objectContaining({ $inc: { value: 2 } }),
          { upsert: true },
        );
    });
  });
