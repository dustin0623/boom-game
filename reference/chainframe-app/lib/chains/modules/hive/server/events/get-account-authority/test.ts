import { beforeEach, describe, expect, it, vi } from "vitest";
const call = vi.hoisted(() => vi.fn());
vi.mock("../../../client", () => ({ hiveClient: { rpc: { call } } }));
import { getAccountAuthority } from "./action";
beforeEach(() => vi.resetAllMocks());
describe("Posting authority lookup", () => {
  it("returns the current authority of the exact normalized account", async () => {
    const posting = {
      weight_threshold: 2,
      key_auths: [["key", 2]],
      account_auths: [],
    };
    call.mockResolvedValue([{ name: "alice", posting }]);
    expect(await getAccountAuthority(" ALICE ")).toEqual(posting);
    expect(call).toHaveBeenCalledWith("condenser_api.get_accounts", [
      ["alice"],
    ]);
  });
  it.each([
    { accounts: [] },
    { accounts: [{ name: "bob", posting: {} }] },
    { accounts: [{ name: "alice" }] },
  ])(
    "rejects missing or mismatched account authority",
    async ({ accounts }) => {
      call.mockResolvedValue(accounts);
      await expect(getAccountAuthority("alice")).rejects.toMatchObject({
        code: "ACCOUNT_NOT_FOUND",
      });
    },
  );
  it("fails on lookup errors without returning an authority", async () => {
    call.mockRejectedValue(Error("RPC unavailable"));
    await expect(getAccountAuthority("alice")).rejects.toThrow(
      "Hive operation failed",
    );
  });
});
