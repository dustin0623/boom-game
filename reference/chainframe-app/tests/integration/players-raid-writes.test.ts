import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/database", () => ({
  connectDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/modules/players/server.model", () => ({
  PlayerModel: { updateOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import { PlayerModel } from "@/lib/modules/players/server.model";
import {
  claimRaidDefender,
  creditRaidProceeds,
  debitRaidRisk,
} from "@/lib/modules/players/server.repository";

const updateOne = vi.mocked(PlayerModel.updateOne) as unknown as ReturnType<
  typeof vi.fn
>;
const findOneAndUpdate = vi.mocked(
  PlayerModel.findOneAndUpdate,
) as unknown as ReturnType<typeof vi.fn>;

function leanResolving(value: unknown) {
  return { lean: () => Promise.resolve(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimRaidDefender", () => {
  it("debits the defender and starts protection in one conditional update", async () => {
    updateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await claimRaidDefender("0xD", 500, 1_000, 61_000);

    expect(result).toEqual({ ok: true });
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter.wallet).toBe("0xD");
    expect(filter.vault).toEqual({ $gte: 500 });
    expect(filter.$or).toEqual([
      { protectionUntil: { $lte: 1_000 } },
      { protectionUntil: { $exists: false } },
    ]);
    expect(update).toEqual({
      $inc: { vault: -500 },
      $set: { protectionUntil: 61_000 },
    });
  });
});

describe("creditRaidProceeds", () => {
  const input = { received: 1_000, capacity: 5_000, xp: 10 };

  it("increments Notoriety from the same expression that credits the vault", async () => {
    findOneAndUpdate.mockReturnValue(leanResolving({ vault: 0 }));

    await creditRaidProceeds("0xA", input);

    const [filter, pipeline, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ wallet: "0xA" });
    expect(options).toMatchObject({ updatePipeline: true, new: false });
    const set = pipeline[0].$set;
    const creditedExpr = set.vault.$add[1];
    expect(set.notoriety.$add[1]).toBe(creditedExpr);
    expect(set["milestones.totalStolen"].$add[1]).toBe(creditedExpr);
  });
});

describe("debitRaidRisk", () => {
  it("deducts the amount from the attacker vault with a floor at zero, in one update", async () => {
    findOneAndUpdate.mockReturnValue(leanResolving({ vault: 1_000 }));

    const result = await debitRaidRisk("0xA", 300);

    expect(result).toEqual({ ok: true, deducted: 300 });
    const [filter, pipeline, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ wallet: "0xA" });
    expect(options).toMatchObject({ updatePipeline: true, new: false });
    expect(pipeline[0].$set.vault.$max[0]).toBe(0);
  });

  it("does not write anything for a zero risk", async () => {
    expect(await debitRaidRisk("0xA", 0)).toEqual({ ok: true, deducted: 0 });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
