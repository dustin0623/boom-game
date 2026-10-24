import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ available: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/chains/modules/hive/client", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/chains/modules/hive/client")
  >()),
  hiveClient: {
    keychain: { isAvailable: sdk.available, requestSignIn: sdk.sign },
  },
}));
import { signHiveLogin } from "./sign";
beforeEach(() => {
  vi.resetAllMocks();
  sdk.available.mockReturnValue(true);
});
describe("Hive provider login signing", () => {
  it("signs the exact readable challenge once using Posting authority", async () => {
    const message = " exact challenge\nAccount: @alice\n";
    const response = {
      success: true,
      username: "alice",
      message,
      authority: "posting",
      signature: "proof",
    };
    sdk.sign.mockResolvedValue(response);
    expect(await signHiveLogin(" ALICE ", message)).toBe(
      JSON.stringify(response),
    );
    expect(sdk.sign).toHaveBeenCalledExactlyOnceWith({
      username: "alice",
      message,
      authority: "posting",
    });
  });
  it("preserves Keychain cancellation without retry", async () => {
    sdk.sign.mockRejectedValue(Error("Sign-in request rejected by user"));
    await expect(signHiveLogin("alice", "challenge")).rejects.toThrow(
      "rejected by user",
    );
    expect(sdk.sign).toHaveBeenCalledOnce();
  });
  it.each([
    { success: true, signature: null },
    { success: false, signature: "proof" },
  ])("rejects incomplete or unsuccessful SDK responses", async (response) => {
    sdk.sign.mockResolvedValue(response);
    await expect(signHiveLogin("alice", "challenge")).rejects.toThrow(
      "authentication was rejected",
    );
    expect(sdk.sign).toHaveBeenCalledOnce();
  });
  it("preserves SDK failures without retry", async () => {
    sdk.sign.mockRejectedValue(Error("Keychain request failed"));
    await expect(signHiveLogin("alice", "challenge")).rejects.toThrow(
      "Keychain request failed",
    );
    expect(sdk.sign).toHaveBeenCalledOnce();
  });
  it("checks availability and identity even when called directly", async () => {
    await expect(signHiveLogin("bad name", "challenge")).rejects.toThrow(
      "valid Hive username",
    );
    sdk.available.mockReturnValue(false);
    await expect(signHiveLogin("alice", "challenge")).rejects.toThrow(
      "not installed",
    );
    expect(sdk.sign).not.toHaveBeenCalled();
  });
});
