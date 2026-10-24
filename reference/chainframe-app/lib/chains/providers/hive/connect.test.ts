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
import { connectHive } from "./connect";
beforeEach(() => {
  vi.resetAllMocks();
  sdk.available.mockReturnValue(true);
});
describe("Hive provider connection", () => {
  it.each(["player123", "player-one", "player.one", "abc.def-123"])(
    "preserves valid account punctuation and digits for %s",
    async (account) => {
      expect(await connectHive(` ${account.toUpperCase()} `)).toEqual({
        address: account,
      });
      expect(sdk.sign).not.toHaveBeenCalled();
    },
  );
  it("returns the normalized address without signing or authenticating", async () => {
    expect(await connectHive(" ALICE ")).toEqual({ address: "alice" });
    expect(sdk.sign).not.toHaveBeenCalled();
  });
  it("rejects invalid usernames before signing", async () => {
    await expect(connectHive("bad name")).rejects.toThrow(
      "valid Hive username",
    );
    expect(sdk.sign).not.toHaveBeenCalled();
  });
  it("preserves the unavailable wallet error", async () => {
    sdk.available.mockReturnValue(false);
    await expect(connectHive("alice")).rejects.toThrow(
      "Hive Keychain is not installed",
    );
    expect(sdk.sign).not.toHaveBeenCalled();
  });
});
