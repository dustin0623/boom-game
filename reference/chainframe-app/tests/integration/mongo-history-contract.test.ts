import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config/database", () => ({
  connectDatabase: vi.fn().mockResolvedValue({}),
}));
import { LogModel } from "@/lib/modules/logs/server.model";
import { logRepository } from "@/lib/modules/logs/server.repository";
const createMongoLogRepository = () => logRepository;
import { createFixtureLogRepository } from "@/tests/fixtures/persistence/log-repository";
import { resetFixtureDatabase } from "@/tests/fixtures/persistence/store";
import { decodeCursor } from "@/lib/utils/logs/history";
let rows: Record<string, unknown>[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  resetFixtureDatabase();
  rows = [];
  vi.spyOn(LogModel, "create").mockImplementation((async (
    input: Record<string, unknown>,
  ) => {
    const row = { ...input, _id: String(rows.length + 1).padStart(24, "0") };
    rows.push(row);
    return row;
  }) as never);
  vi.spyOn(LogModel, "find").mockImplementation(((
    filter: Record<string, unknown>,
  ) => {
    let direction = -1,
      limit = 100;
    const chain = {
      sort: (sort: Record<string, number>) => {
        direction = sort.recordedAt ?? sort.createdAt;
        return chain;
      },
      limit: (n: number) => {
        limit = n;
        return chain;
      },
      lean: async () => {
        return rows
          .filter(
            (row) =>
              !filter.participants ||
              (row.participants as string[]).includes(
                filter.participants as string,
              ),
          )
          .filter(
            (row) =>
              !filter.type ||
              (filter.type as { $in: string[] }).$in.includes(String(row.type)),
          )
          .filter(
            (row) =>
              !filter["data.action"] ||
              (filter["data.action"] as { $in: string[] }).$in.includes(
                String((row.data as Record<string, unknown>).action),
              ),
          )
          .filter((row) => {
            if (!filter.$or) return true;
            const conditions = filter.$or as {
              recordedAt: number | Record<string, number>;
              _id?: Record<string, string>;
            }[];
            return conditions.some((condition) => {
              if (typeof condition.recordedAt === "number")
                return (
                  row.recordedAt === condition.recordedAt &&
                  (direction === 1
                    ? String(row._id) > condition._id!.$gt
                    : String(row._id) < condition._id!.$lt)
                );
              return direction === 1
                ? Number(row.recordedAt) > condition.recordedAt.$gt
                : Number(row.recordedAt) < condition.recordedAt.$lt;
            });
          })
          .sort(
            (a, b) =>
              direction *
              (Number(a.recordedAt) - Number(b.recordedAt) ||
                String(a._id).localeCompare(String(b._id))),
          )
          .slice(0, limit);
      },
    };
    return chain;
  }) as never);
});
for (const [provider, create] of [
  ["mock", createFixtureLogRepository],
  ["mongodb", createMongoLogRepository],
] as const)
  describe(provider + " log repository contract", () => {
    it("serves a single trade to both participants and keeps public sales separate from listings", async () => {
      const repository = create();
      await repository.create({
        type: "market",
        wallet: "buyer",
        target: "seller",
        data: {
          currency: "HIVE",
          action: "bought",
          name: "Miner",
          serverSeed: "private",
        },
      });
      await repository.create({
        type: "market_item",
        wallet: "seller",
        data: { currency: "HIVE", action: "listed", name: "Another miner" },
      });
      expect(await repository.listMarketHistory("buyer", 10)).toHaveLength(1);
      expect(await repository.listMarketHistory("seller", 10)).toHaveLength(2);
      expect(await repository.listMarketHistory("other", 10)).toHaveLength(0);
      const sales = await repository.listMarketSales(10);
      expect(sales).toHaveLength(1);
      expect(JSON.stringify(sales)).not.toContain("private");
    });
    it("scopes actor and target history and strips private fields", async () => {
      const repository = create();
      await repository.create({
        type: "raid",
        wallet: "a",
        target: "b",
        seed: "hidden",
        data: {
          serverSeed: "hidden",
          jobId: "hidden",
        },
      });
      for (const wallet of ["a", "b"]) {
        const page = await repository.listHistory(wallet, { limit: 2 });
        expect(page.logs).toHaveLength(1);
        expect(JSON.stringify(page)).not.toContain("hidden");
      }
      expect(
        (await repository.listHistory("c", { limit: 2 })).logs,
      ).toHaveLength(0);
    });
    it("paginates ties in both directions", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1000);
      const repository = create();
      for (let i = 0; i < 6; i++)
        await repository.create({ type: "claim", wallet: "a" });
      const first = await repository.listHistory("a", { limit: 2 });
      const second = await repository.listHistory("a", {
        limit: 2,
        cursor: decodeCursor(first.nextCursor!),
      });
      expect(
        new Set([...first.logs, ...second.logs].map((log) => log.id)).size,
      ).toBe(4);
      await repository.create({ type: "claim", wallet: "a" });
      const added = await repository.listHistory("a", {
        limit: 2,
        cursor: decodeCursor(first.latestCursor!),
        direction: "newer",
      });
      expect(added.logs).toHaveLength(1);
    });
  });
