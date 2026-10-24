import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ call: vi.fn(), find: vi.fn() }));
vi.mock("../../../client", () => ({
  hiveClient: {
    rpc: { call: sdk.call },
    payments: { engineRpc: { findOne: sdk.find } },
  },
}));
import { getBalance } from "./action";
beforeEach(() => {
  vi.resetAllMocks();
  sdk.call.mockResolvedValue([{ name: "alice", balance: "12.500 HIVE" }]);
  sdk.find.mockResolvedValue({ symbol: "HASH", balance: "42.000" });
});
describe("Hive balance reads", () => {
  it("reads the normalized account and explicitly selected token", async () => {
    expect(await getBalance(" ALICE ", "HASH", 3)).toEqual({
      hive: "12.500",
      hbd: "0",
      token: "42.000",
      symbol: "HASH",
      precision: { hive: 3, hbd: 3, token: 3 },
    });
    expect(sdk.call).toHaveBeenCalledWith("condenser_api.get_accounts", [
      ["alice"],
    ]);
    expect(sdk.find).toHaveBeenCalledWith({
      contract: "tokens",
      table: "balances",
      query: { account: "alice", symbol: "HASH" },
    });
  });
  it("uses another explicit asset without changing the game currency", async () => {
    sdk.find.mockResolvedValue({ symbol: "SCRAP", balance: "7.00000000" });
    expect((await getBalance("alice", "SCRAP", 8)).token).toBe("7.00000000");
  });
  it("reads HIVE without contacting an unavailable Hive Engine", async () => {
    sdk.find.mockRejectedValue(Error("Engine unavailable"));
    expect((await getBalance("alice", "HIVE", 3)).hive).toBe("12.500");
    expect(sdk.find).not.toHaveBeenCalled();
  });
  it("returns zero only for an absent token row", async () => {
    sdk.find.mockResolvedValue(null);
    expect((await getBalance("alice", "HASH", 3)).token).toBe("0");
  });
  it("preserves account and network failures instead of inventing a balance", async () => {
    sdk.call.mockResolvedValue([]);
    await expect(getBalance("ghost", "HASH", 3)).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
    });
    sdk.call.mockResolvedValue([{ name: "alice" }]);
    sdk.find.mockRejectedValue(Error("unavailable"));
    await expect(getBalance("alice", "HASH", 3)).rejects.toThrow(
      "Hive operation failed",
    );
  });
  it("rejects invalid usernames before RPC", async () => {
    await expect(getBalance("a", "HASH", 3)).rejects.toMatchObject({
      code: "INVALID_ACCOUNT",
    });
    expect(sdk.call).not.toHaveBeenCalled();
  });
});
