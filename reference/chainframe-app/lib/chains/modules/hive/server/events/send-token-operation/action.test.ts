import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ issue: vi.fn(), transfer: vi.fn() }));
vi.mock("../../../client", () => ({ hiveClient: { issuer: { token: sdk } } }));
import { sendTokenOperation } from "./action";
const input = {
  from: { alias: "treasury", signing: true },
  account: " ALICE ",
  quantity: "10.000",
  symbol: "HASH",
  memo: '{"action":"withdrawal","metadata":{"memo":"Chainframe withdrawal origin"}}',
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.issue.mockResolvedValue({ success: true, transactionId: "issue" });
  sdk.transfer.mockResolvedValue({ success: true, transactionId: "transfer" });
});
describe("published token issuer operations", () => {
  it.each(["issue", "transfer"] as const)(
    "uses %s with exact memo and decimal quantity",
    async (operation) => {
      expect(await sendTokenOperation({ ...input, operation })).toMatchObject({
        transactionId: operation,
      });
      expect(sdk[operation]).toHaveBeenCalledExactlyOnceWith({
        ...input,
        account: "alice",
      });
      expect(
        sdk[operation === "issue" ? "transfer" : "issue"],
      ).not.toHaveBeenCalled();
    },
  );
  it("preserves missing IDs for uncertainty handling", async () => {
    sdk.issue.mockResolvedValue({ success: true });
    expect(await sendTokenOperation({ ...input, operation: "issue" })).toEqual({
      success: true,
    });
  });
  it("does not retry a thrown mint", async () => {
    sdk.issue.mockRejectedValue(Error("response lost"));
    await expect(
      sendTokenOperation({ ...input, operation: "issue" }),
    ).rejects.toThrow("Hive operation failed");
    expect(sdk.issue).toHaveBeenCalledOnce();
  });
  it.each(["0", "-1", "1e3", "1.000000001"])(
    "rejects %s before sending",
    async (quantity) => {
      await expect(
        sendTokenOperation({ ...input, quantity, operation: "issue" }),
      ).rejects.toThrow();
      expect(sdk.issue).not.toHaveBeenCalled();
    },
  );
});
