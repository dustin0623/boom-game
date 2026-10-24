import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config/database", () => ({ connectDatabase: vi.fn() }));
import { GameStatModel } from "@/lib/modules/game-stats/server.model";
import { PlayerModel } from "@/lib/modules/players/server.model";
import {
  contractStreamRepository,
  incrementStat,
  setStatMax,
  getStat,
} from "@/lib/modules/game-stats/server.repository";
import { HIVE_WORKER_LEASE_ID } from "@/lib/modules/game-stats/server.types";
import {
  issueLoginNonce,
  consumeLoginNonce,
  initializePlayerProfile,
} from "@/lib/modules/players/server.repository";
afterEach(() => vi.restoreAllMocks());
describe("consolidated collection guards", () => {
  it("reserves the worker lease ID across numeric helpers", async () => {
    for (const run of [
      () => incrementStat(HIVE_WORKER_LEASE_ID),
      () => setStatMax(HIVE_WORKER_LEASE_ID, 1),
      () => getStat(HIVE_WORKER_LEASE_ID),
    ])
      await expect(run()).rejects.toThrow("Reserved Hive worker lease");
  });
  it("guards renewal with the owner and unexpired lease and releases only its owner", async () => {
    const update = vi
      .spyOn(GameStatModel, "updateOne")
      .mockResolvedValue({ matchedCount: 0 } as never);
    expect(await contractStreamRepository.renewLease("owner", 1000)).toBe(
      false,
    );
    expect(update.mock.calls[0][0]).toMatchObject({
      _id: HIVE_WORKER_LEASE_ID,
      leaseOwner: "owner",
      leaseExpiresAt: { $gt: expect.any(Number) },
    });
    await contractStreamRepository.releaseLease("owner");
    expect(update.mock.calls[1]).toEqual([
      { _id: HIVE_WORKER_LEASE_ID, leaseOwner: "owner" },
      {
        $unset: { leaseOwner: 1, leaseExpiresAt: 1 },
        $set: { workerReady: false },
      },
    ]);
    expect(GameStatModel.schema.path("checkpoint")).toBeUndefined();
    expect(contractStreamRepository).not.toHaveProperty("getCheckpoint");
    expect(contractStreamRepository).not.toHaveProperty("saveCheckpoint");
  });
  it("treats concurrent lease upsert conflicts as unavailable", async () => {
    vi.spyOn(GameStatModel, "init").mockResolvedValue(undefined as never);
    vi.spyOn(GameStatModel, "updateOne").mockRejectedValue(
      Object.assign(Error("conflict"), { code: 11000 }),
    );
    expect(await contractStreamRepository.acquireLease("owner", 1000)).toBe(
      false,
    );
  });
  it("stores a nonce on an unregistered shell without changing gameplay fields", async () => {
    vi.spyOn(PlayerModel, "init").mockResolvedValue(undefined as never);
    const update = vi
      .spyOn(PlayerModel, "findOneAndUpdate")
      .mockResolvedValue(null);
    await issueLoginNonce("alice", "hash", 123);
    expect(update).toHaveBeenCalledWith(
      { wallet: "alice" },
      {
        $set: { loginNonce: "hash", loginNonceExpiresAt: 123 },
        $setOnInsert: {
          wallet: "alice",
          username: "alice",
          profileInitialized: false,
          registrationTime: expect.any(Number),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    expect(PlayerModel.schema.path("loginNonce").options.select).toBe(false);
    expect(PlayerModel.schema.path("loginNonceExpiresAt").options.select).toBe(
      false,
    );
    expect(
      PlayerModel.schema
        .indexes()
        .some(
          ([fields, options]) =>
            options.expireAfterSeconds !== undefined &&
            "loginNonceExpiresAt" in fields,
        ),
    ).toBe(false);
  });
  it("consumes only the exact unexpired nonce and leaves a lost race unconsumed", async () => {
    const update = vi
      .spyOn(PlayerModel, "updateOne")
      .mockResolvedValueOnce({ modifiedCount: 1 } as never)
      .mockResolvedValueOnce({ modifiedCount: 0 } as never);
    expect(await consumeLoginNonce("alice", "hash", 123, 100)).toBe(true);
    expect(await consumeLoginNonce("alice", "hash", 123, 100)).toBe(false);
    expect(update.mock.calls[0]).toEqual([
      {
        wallet: "alice",
        loginNonce: "hash",
        loginNonceExpiresAt: { $eq: 123, $gt: 100 },
      },
      { $unset: { loginNonce: 1, loginNonceExpiresAt: 1 } },
    ]);
  });
  it("claims profile initialization only when its marker is explicitly false", async () => {
    const update = vi
      .spyOn(PlayerModel, "updateOne")
      .mockResolvedValue({ modifiedCount: 1 } as never);
    expect(await initializePlayerProfile("alice")).toBe(true);
    expect(update).toHaveBeenCalledWith(
      { wallet: "alice", profileInitialized: false },
      { $set: { profileInitialized: true } },
    );
  });
});
