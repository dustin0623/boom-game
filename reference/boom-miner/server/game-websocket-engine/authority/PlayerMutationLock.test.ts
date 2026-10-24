import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/config/database", () => ({ connectDatabase: mocks.connect }));
vi.mock("@/lib/modules/players/model.server", () => ({
  PlayerModel: {
    findOneAndUpdate: mocks.findOneAndUpdate,
    updateOne: mocks.updateOne,
  },
}));

import {
  acquirePlayerMutation,
  releasePlayerMutation,
} from "@/lib/modules/players/game-mutation-lock.server";

describe("player game mutation lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acquires only when both the game lease and prior mutation lock are inactive", async () => {
    const lean = vi.fn().mockResolvedValue({ _id: "player" });
    const query = {
      select: vi.fn().mockReturnThis(),
      lean,
    };
    mocks.findOneAndUpdate.mockReturnValue(query);

    const lockId = await acquirePlayerMutation("wallet-a");

    expect(lockId).toMatch(/^[0-9a-f-]{36}$/);
    const [filter, update] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter.wallet.$regex).toBeInstanceOf(RegExp);
    expect(filter.$and).toHaveLength(2);
    expect(update.$set["game.mutationLock"]).toMatchObject({
      id: lockId,
      expiresAt: expect.any(Date),
    });
  });

  it("returns null when the game lease prevents a roster mutation", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    };
    mocks.findOneAndUpdate.mockReturnValue(query);
    await expect(acquirePlayerMutation("wallet-a")).resolves.toBeNull();
  });

  it("releases only the caller's mutation lock", async () => {
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    await releasePlayerMutation("wallet-a", "lock-a");
    expect(mocks.updateOne).toHaveBeenCalledWith(
      {
        wallet: { $regex: expect.any(RegExp) },
        "game.mutationLock.id": "lock-a",
      },
      { $unset: { "game.mutationLock": 1 } },
    );
  });
});
