import { HiveClient } from "hivexph-sdk";

/** Fixed public game configuration shared by signing, decoding and validation. */
export const GAME_ACTION_CUSTOM_JSON_ID = "chainframe-game" as const;
export const GAME_ACTION_PROTOCOL_VERSION = 1 as const;

/** Key-free configuration shared by browser and server runtimes. */
export const hiveClient = new HiveClient({
  applicationId: GAME_ACTION_CUSTOM_JSON_ID,
  accounts: {
    treasury: {
      accountEnv: "HIVE_TREASURY_ACCOUNT",
      keyEnv: "HIVE_TREASURY_ACTIVE_KEY",
    },
    market: {
      accountEnv: "HIVE_MARKET_ACCOUNT",
      keyEnv: "HIVE_MARKET_ACTIVE_KEY",
    },
  },
});
