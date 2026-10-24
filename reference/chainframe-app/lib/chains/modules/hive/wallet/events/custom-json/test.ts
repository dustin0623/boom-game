import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeychainCustomJsonRawInput } from "hivexph-sdk";
const sdk = vi.hoisted(() => ({ available: vi.fn(), broadcast: vi.fn() }));
vi.mock("../../../client", () => ({
  hiveClient: {
    keychain: { isAvailable: sdk.available, customJsonRaw: sdk.broadcast },
  },
}));
import { broadcastCustomJson } from "./action";
const input: KeychainCustomJsonRawInput = {
  username: " ALICE ",
  id: "application",
  authority: "posting",
  json: '{"original":"payload"}',
  message: "Sign action",
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.available.mockReturnValue(true);
  sdk.broadcast.mockResolvedValue({ transactionId: "tx" });
});
describe("raw wallet Custom JSON transport", () => {
  it("broadcasts original JSON once with explicit id and authority", async () => {
    expect(await broadcastCustomJson(input)).toMatchObject({
      ok: true,
      transactionId: "tx",
      username: "alice",
    });
    expect(sdk.broadcast).toHaveBeenCalledExactlyOnceWith({
      ...input,
      username: "alice",
    });
  });
  it("preserves Active signing without interpreting game actions", async () => {
    await broadcastCustomJson({ ...input, authority: "active" });
    expect(sdk.broadcast).toHaveBeenCalledWith({
      ...input,
      username: "alice",
      authority: "active",
    });
  });
  it("keeps a successful missing ID uncertain", async () => {
    sdk.broadcast.mockResolvedValue({ transactionId: null });
    expect(await broadcastCustomJson(input)).toMatchObject({
      ok: true,
      transactionId: null,
    });
    expect(sdk.broadcast).toHaveBeenCalledOnce();
  });
  it.each([
    ["user_cancel", "cancelled"],
    ["incomplete_data", "failed"],
    ["network", "failed"],
  ])("reports %s without retry", async (code, status) => {
    sdk.broadcast.mockRejectedValue({ raw: { error: code } });
    expect(await broadcastCustomJson(input)).toMatchObject({
      ok: false,
      status,
    });
    expect(sdk.broadcast).toHaveBeenCalledOnce();
  });
  it("reports unavailable Keychain without broadcasting", async () => {
    sdk.available.mockReturnValue(false);
    expect(await broadcastCustomJson(input)).toMatchObject({
      status: "unavailable",
    });
    expect(sdk.broadcast).not.toHaveBeenCalled();
  });
  it("rejects invalid account names before signing", async () => {
    expect(
      await broadcastCustomJson({ ...input, username: "bad name" }),
    ).toMatchObject({ status: "failed", error: "Enter a valid Hive username" });
    expect(sdk.broadcast).not.toHaveBeenCalled();
  });
});
