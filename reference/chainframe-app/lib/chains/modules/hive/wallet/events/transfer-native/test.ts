import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ available: vi.fn(), transfer: vi.fn() }));
vi.mock("../../../client", () => ({
  hiveClient: {
    keychain: {
      isAvailable: sdk.available,
      payments: { hive: { transfer: sdk.transfer } },
    },
  },
}));
import { transferNative } from "./action";
const input = {
  username: " ALICE ",
  account: "treasury",
  amount: "1.000",
  symbol: "HIVE",
  action: "caller_action",
  metadata: { value: "unchanged" },
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.available.mockReturnValue(true);
  sdk.transfer.mockResolvedValue({ success: true, transactionId: "tx" });
});
describe("wallet native transfer", () => {
  it("signs once using caller inputs without game policy", async () => {
    expect(await transferNative(input)).toEqual({ transactionId: "tx" });
    expect(sdk.transfer).toHaveBeenCalledExactlyOnceWith({
      ...input,
      username: "alice",
    });
  });
  it("preserves missing-ID uncertainty without signing again", async () => {
    sdk.transfer.mockResolvedValue({ success: true, transactionId: null });
    await expect(transferNative(input)).rejects.toThrow(
      "submitted without a transaction id",
    );
    expect(sdk.transfer).toHaveBeenCalledOnce();
  });
  it.each(["Cancelled", "Broadcast failed"])(
    "preserves %s without retry",
    async (error) => {
      sdk.transfer.mockRejectedValue(Error(error));
      await expect(transferNative(input)).rejects.toThrow(error);
      expect(sdk.transfer).toHaveBeenCalledOnce();
    },
  );
  it("does not sign when Keychain is unavailable", async () => {
    sdk.available.mockReturnValue(false);
    await expect(transferNative(input)).rejects.toThrow("not installed");
    expect(sdk.transfer).not.toHaveBeenCalled();
  });
  it("rejects invalid quantities before signing", async () => {
    await expect(
      transferNative({ ...input, amount: "0.000" }),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    expect(sdk.transfer).not.toHaveBeenCalled();
  });
});
