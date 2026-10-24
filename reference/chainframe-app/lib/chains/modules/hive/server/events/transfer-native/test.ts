import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ transfer: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../client", () => ({
  hiveClient: {
    resolveAccount: sdk.resolve,
    accounts: { treasury: { alias: "treasury" } },
    payments: { hive: { transfer: sdk.transfer } },
  },
}));
import { transferNative } from "./action";
const input = {
  from: { alias: "treasury", signing: true },
  account: " ALICE ",
  amount: "1.000",
  symbol: "HIVE",
  action: "refund",
  metadata: { memo: "original intent" },
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.resolve.mockReturnValue({ account: "treasury" });
  sdk.transfer.mockResolvedValue({ success: true, transactionId: "tx" });
});
describe("server native transfer", () => {
  it("broadcasts once with the explicit asset and unchanged payload", async () => {
    expect(await transferNative(input)).toMatchObject({
      success: true,
      transactionId: "tx",
      from: "treasury",
      to: "alice",
      symbol: input.symbol,
    });
    expect(sdk.transfer).toHaveBeenCalledExactlyOnceWith({
      ...input,
      account: "alice",
      from: input.from,
    });
  });
  it("supports another caller-selected asset without changing workflow policy", async () => {
    await transferNative({ ...input, symbol: "HBD" });
    expect(sdk.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "HBD" }),
    );
  });
  it.each(["0", "0.000", "-1", "1e3", "bad", "1.0001"])(
    "rejects invalid quantity %s before broadcast",
    async (amount) => {
      await expect(
        transferNative({ ...input, amount: amount }),
      ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
      expect(sdk.transfer).not.toHaveBeenCalled();
    },
  );
  it("retains missing transaction IDs for queue uncertainty handling without retry", async () => {
    sdk.transfer.mockResolvedValue({ success: true });
    expect(await transferNative(input)).toMatchObject({
      success: true,
      transactionId: undefined,
    });
    expect(sdk.transfer).toHaveBeenCalledOnce();
  });
  it("normalizes a failed broadcast and never retries it", async () => {
    sdk.transfer.mockRejectedValue(Error("lost response"));
    await expect(transferNative(input)).rejects.toThrow(
      "Hive operation failed",
    );
    expect(sdk.transfer).toHaveBeenCalledOnce();
  });
  it("does not send when treasury configuration cannot resolve", async () => {
    sdk.resolve.mockImplementation(() => {
      throw Error("missing account");
    });
    await expect(transferNative(input)).rejects.toThrow(
      "Hive operation failed",
    );
    expect(sdk.transfer).not.toHaveBeenCalled();
  });
});
