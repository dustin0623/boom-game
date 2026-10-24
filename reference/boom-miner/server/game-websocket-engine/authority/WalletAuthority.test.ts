import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/config/database", () => ({ connectDatabase: mocks.connect }));
vi.mock("@/lib/modules/players/model.server", () => ({
  PlayerModel: {
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOne: mocks.findOne,
    updateOne: mocks.updateOne,
  },
}));

import { WalletAuthority } from "./WalletAuthority";

function leanResult<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

const grant = {
  wallet: "wallet-a",
  instanceId: "instance-a",
  fencingToken: 3,
  expiresAt: new Date(Date.now() + 10_000),
};

describe("WalletAuthority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when another game service owns the player lease", async () => {
    mocks.findOneAndUpdate.mockReturnValue(leanResult(null));
    await expect(new WalletAuthority().acquire("wallet-a")).resolves.toBeNull();
  });

  it("acquires the player lease with a single-document conditional update", async () => {
    const authority = new WalletAuthority();
    Object.defineProperty(authority, "instanceId", { value: "instance-a" });
    const expiresAt = new Date(Date.now() + 10_000);
    mocks.findOneAndUpdate.mockReturnValue(
      leanResult({
        game: { lease: { instanceId: "instance-a", fencingToken: 4, expiresAt } },
      }),
    );

    await expect(authority.acquire("wallet-a")).resolves.toEqual({
      wallet: "wallet-a",
      instanceId: "instance-a",
      fencingToken: 4,
      expiresAt,
    });
    const [filter, update, options] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter.wallet).toBe("wallet-a");
    expect(filter.$and).toHaveLength(2);
    expect(update).toEqual([
      {
        $set: {
          "game.lease": {
            instanceId: "instance-a",
            fencingToken: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$game.lease.instanceId", "instance-a"] },
                    { $gt: ["$game.lease.expiresAt", expect.any(Date)] },
                  ],
                },
                { $ifNull: ["$game.lease.fencingToken", 1] },
                { $add: [{ $ifNull: ["$game.lease.fencingToken", 0] }, 1] },
              ],
            },
            expiresAt: expect.any(Date),
          },
        },
      },
    ]);
    expect(options).toMatchObject({ updatePipeline: true, returnDocument: "after" });
  });

  it("renews and validates only the matching fencing token", async () => {
    const authority = new WalletAuthority();
    Object.defineProperty(authority, "instanceId", { value: "instance-a" });
    mocks.findOneAndUpdate.mockReturnValue(
      leanResult({
        game: {
          lease: {
            instanceId: grant.instanceId,
            fencingToken: grant.fencingToken,
            expiresAt: grant.expiresAt,
          },
        },
      }),
    );
    mocks.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue(leanResult({ _id: "lease" })),
    });

    await expect(authority.renew(grant)).resolves.toMatchObject({ fencingToken: 3 });
    await expect(authority.assertCurrent(grant)).resolves.toBe(true);
    expect(mocks.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: "wallet-a",
        "game.lease.instanceId": "instance-a",
        "game.lease.fencingToken": 3,
      }),
    );
  });

  it("releases only its exact fenced lease", async () => {
    const authority = new WalletAuthority();
    Object.defineProperty(authority, "instanceId", { value: "instance-a" });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    await authority.release("wallet-a", 3);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      {
        wallet: "wallet-a",
        "game.lease.instanceId": "instance-a",
        "game.lease.fencingToken": 3,
      },
      expect.any(Object),
    );
  });
});
