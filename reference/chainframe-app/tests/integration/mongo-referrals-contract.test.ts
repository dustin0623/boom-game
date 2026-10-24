import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config/database", () => ({ connectDatabase: vi.fn() }));
import { PlayerModel } from "@/lib/modules/players/server.model";
import { playerRepository } from "@/lib/modules/players/server.repository";
const createMongoPlayerRepository = () => playerRepository;
import { createFixturePlayerRepository } from "@/tests/fixtures/persistence/player-repository";
import {
  resetFixtureDatabase,
  seedFixturePlayer,
} from "@/tests/fixtures/persistence/store";
beforeEach(() => resetFixtureDatabase());
afterEach(() => vi.restoreAllMocks());
describe("referral repository results", () => {
  it("returns only the requested wallet's safe referral projection in mock", async () => {
    seedFixturePlayer({
      wallet: "friend",
      username: "friend",
      registrationTime: 123,
      referredBy: "alice",
      hash: 999,
    });
    seedFixturePlayer({ wallet: "other", referredBy: "bob" });
    expect(await createFixturePlayerRepository().listReferred("alice")).toEqual(
      [{ username: "friend", wallet: "friend", registrationTime: 123 }],
    );
  });
  it("uses the same projection and wallet filter in Mongo", async () => {
    const find = vi.spyOn(PlayerModel, "find").mockReturnValue({
      lean: async () => [
        {
          username: "friend",
          wallet: "friend",
          registrationTime: 123,
          _id: "internal",
        },
      ],
    } as never);
    expect(await createMongoPlayerRepository().listReferred("alice")).toEqual([
      { username: "friend", wallet: "friend", registrationTime: 123 },
    ]);
    expect(find).toHaveBeenCalledWith(
      { referredBy: "alice" },
      { username: 1, wallet: 1, registrationTime: 1 },
    );
  });
});
