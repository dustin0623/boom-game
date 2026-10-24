import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ available: vi.fn(), transfer: vi.fn() }));
vi.mock("../../../client", () => ({
  hiveClient: {
    keychain: {
      isAvailable: sdk.available,
      payments: { engine: { transfer: sdk.transfer } },
    },
  },
}));
import { transferToken } from "./action";
const input = {
  username: " ALICE ",
  account: "treasury",
  quantity: "1.000",
  symbol: "HASH",
  action: "caller_action",
  metadata: { value: "unchanged" },
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.available.mockReturnValue(true);
  sdk.transfer.mockResolvedValue({ success: true, transactionId: "tx" });
});
describe("wallet token transfer", () => {
  it("signs once using caller inputs without game policy", async () => {
    expect(await transferToken(input)).toEqual({ transactionId: "tx" });
    expect(sdk.transfer).toHaveBeenCalledExactlyOnceWith({
      ...input,
      username: "alice",
    });
  });
  it("preserves missing-ID uncertainty without signing again", async () => {
    sdk.transfer.mockResolvedValue({ success: true, transactionId: null });
    await expect(transferToken(input)).rejects.toThrow(
      "submitted without a transaction id",
    );
    expect(sdk.transfer).toHaveBeenCalledOnce();
  });
  it.each(["Cancelled", "Broadcast failed"])(
    "preserves %s without retry",
    async (error) => {
      sdk.transfer.mockRejectedValue(Error(error));
      await expect(transferToken(input)).rejects.toThrow(error);
      expect(sdk.transfer).toHaveBeenCalledOnce();
    },
  );
  it("does not sign when Keychain is unavailable", async () => {
    sdk.available.mockReturnValue(false);
    await expect(transferToken(input)).rejects.toThrow("not installed");
    expect(sdk.transfer).not.toHaveBeenCalled();
  });
  it("rejects invalid quantities before signing", async () => {
    await expect(
      transferToken({ ...input, quantity: "0.000" }),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    expect(sdk.transfer).not.toHaveBeenCalled();
  });
});
