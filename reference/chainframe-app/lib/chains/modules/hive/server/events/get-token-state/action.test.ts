import { beforeEach, describe, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("../../../client", () => ({
  hiveClient: { payments: { engineRpc: { findOne: find } } },
}));
import { getTokenState } from "./action";
const token = {
  symbol: "HASH",
  issuer: "treasury",
  precision: 3,
  supply: "20.000",
  maxSupply: "100.000",
};
const balance = { account: "treasury", symbol: "HASH", balance: "3.000" };
beforeEach(() => {
  vi.resetAllMocks();
  find.mockImplementation(async ({ table }) =>
    table === "tokens" ? token : balance,
  );
});
describe("token state evidence", () => {
  it("reads exact asset metadata and liquid balance through the shared SDK", async () => {
    expect(await getTokenState(" TREASURY ", "HASH")).toEqual({
      ...token,
      balance: "3.000",
    });
    expect(find).toHaveBeenCalledWith({
      contract: "tokens",
      table: "balances",
      query: { account: "treasury", symbol: "HASH" },
    });
  });
  it("uses zero only for a successful missing balance row", async () => {
    find.mockImplementation(async ({ table }) =>
      table === "tokens" ? token : null,
    );
    expect(await getTokenState("treasury", "HASH")).toMatchObject({
      balance: "0",
    });
  });
  it.each([
    undefined,
    {},
    { ...balance, balance: "-1" },
    { ...balance, balance: "1e3" },
    { ...balance, balance: "1.0001" },
    { ...balance, account: "other" },
    { ...balance, symbol: "OTHER" },
  ])("rejects malformed or mismatched balance evidence: %j", async (row) => {
    find.mockImplementation(async ({ table }) =>
      table === "tokens" ? token : row,
    );
    await expect(getTokenState("treasury", "HASH")).rejects.toThrow();
  });
  it.each([
    null,
    { ...token, precision: 9 },
    { ...token, supply: "101" },
    { ...token, symbol: "OTHER" },
    { ...token, maxSupply: "NaN" },
    { ...token, issuer: "" },
  ])("rejects invalid token metadata: %j", async (row) => {
    find.mockImplementation(async ({ table }) =>
      table === "tokens" ? row : balance,
    );
    await expect(getTokenState("treasury", "HASH")).rejects.toThrow();
  });
  it("preserves read failures without inventing zero", async () => {
    find.mockRejectedValue(new Error("RPC unavailable"));
    await expect(getTokenState("treasury", "HASH")).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    });
  });
});
