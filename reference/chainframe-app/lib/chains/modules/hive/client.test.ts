import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hiveClient,
  GAME_ACTION_CUSTOM_JSON_ID,
  GAME_ACTION_PROTOCOL_VERSION,
} from "./client";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("shared key-free Hive client", () => {
  it("contains only environment names and creates no connection when imported without browser or keys", async () => {
    vi.stubEnv("HIVE_TREASURY_ACCOUNT", "");
    vi.stubEnv("HIVE_TREASURY_ACTIVE_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", undefined);
    vi.resetModules();
    const imported = await import("./client");
    const protocol = await import("@/lib/utils/game/action-protocol");
    expect(imported.GAME_ACTION_CUSTOM_JSON_ID).toBe("chainframe-game");
    expect(imported.GAME_ACTION_PROTOCOL_VERSION).toBe(1);
    expect(imported.GAME_ACTION_CUSTOM_JSON_ID).toBe(
      GAME_ACTION_CUSTOM_JSON_ID,
    );
    expect(imported.GAME_ACTION_PROTOCOL_VERSION).toBe(
      GAME_ACTION_PROTOCOL_VERSION,
    );
    expect(protocol.buildClaimAction({ nonce: "import-test-123456" })).toEqual({
      version: 1,
      action: "claim",
      metadata: { nonce: "import-test-123456" },
    });
    expect(imported.hiveClient.configs).toEqual({
      applicationId: "chainframe-game",
      accounts: {
        market: {
          accountEnv: "HIVE_MARKET_ACCOUNT",
          keyEnv: "HIVE_MARKET_ACTIVE_KEY",
        },
        treasury: {
          accountEnv: "HIVE_TREASURY_ACCOUNT",
          keyEnv: "HIVE_TREASURY_ACTIVE_KEY",
        },
      },
    });
    expect(imported.hiveClient.configs).toEqual(hiveClient.configs);
    expect(imported.hiveClient.accounts.treasury).not.toHaveProperty("key");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("resolves account configuration lazily without storing credential values", () => {
    vi.stubEnv("HIVE_TREASURY_ACCOUNT", "treasury");
    vi.stubEnv("HIVE_TREASURY_ACTIVE_KEY", "test-only-key");
    expect(hiveClient.resolveAccount("treasury")).toEqual({
      alias: "treasury",
      account: "treasury",
    });
    expect(JSON.stringify(hiveClient.configs)).not.toContain("test-only-key");
    vi.stubEnv("HIVE_TREASURY_ACCOUNT", "replacement");
    expect(hiveClient.resolveAccount("treasury").account).toBe("replacement");
  });
});
