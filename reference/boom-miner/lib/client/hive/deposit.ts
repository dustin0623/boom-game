"use client";

/**
 * lib/client/hive/deposit.ts
 *
 * Player → treasury Hive-Engine token deposit, signed IN THE BROWSER via the
 * Hive Keychain extension with the player's ACTIVE key.
 *
 * Hive-Engine tokens (BMCOIN, SCRAP, etc.) are layer-2 assets — they are NOT
 * native HIVE/HBD and CANNOT be sent with requestTransfer. Instead, we use
 * Hive Keychain's `requestCustomJson` to broadcast a `custom_json` operation
 * with id = `ssc-mainnet-hive` and a `tokens.transfer` payload. This mirrors
 * exactly what the server-side treasury payout does in lib/chain/hive/transfer.ts.
 *
 * CLIENT-ONLY.
 */

import type { DepositParams, DepositResult } from "../types";

/** Default Hive-Engine custom_json id if not supplied via DepositParams. */
const DEFAULT_ENGINE_ID = "ssc-mainnet-hive";

/**
 * Subset of the Hive Keychain API we depend on.
 *
 * requestCustomJson signature:
 *   (account, id, keyType, json, displayTitle, callback)
 *
 *   account      — Hive username signing the operation
 *   id           — Hive-Engine sidechain id (e.g. "ssc-mainnet-hive")
 *   keyType      — "Active" | "Posting" (tokens.transfer requires "Active")
 *   json         — serialised JSON string of the Hive-Engine payload
 *   displayTitle — human-readable title shown in the Keychain popup
 *   callback     — result callback
 */
/**
 * Hive Keychain requestCustomJson callback response.
 * result.id is the Hive consensus-layer transaction id — confirmed present
 * in Keychain's implementation (see delegate-rc pattern in rhiaji/multicore-app).
 */
interface KeychainCustomJson {
  requestCustomJson: (
    account:      string,
    id:           string,
    keyType:      "Active" | "Posting",
    json:         string,
    displayTitle: string,
    callback: (response: {
      success:  boolean;
      error?:   string;
      message?: string;
      /** Hive tx id — present on success for requestCustomJson broadcasts. */
      result?:  { id?: string; tx_id?: string };
    }) => void,
  ) => void;
}

function getKeychain(): KeychainCustomJson | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { hive_keychain?: KeychainCustomJson })
    .hive_keychain;
}

/**
 * Asks Hive Keychain to broadcast a Hive-Engine `tokens.transfer` custom_json,
 * moving `params.amount` of `params.token` from `account` to `params.treasury`.
 *
 * The `tokens.transfer` payload format is the canonical Hive-Engine standard:
 * {
 *   contractName:    "tokens",
 *   contractAction:  "transfer",
 *   contractPayload: { symbol, to, quantity, memo }
 * }
 *
 * `quantity` must be a fixed-decimal string matching the token's precision
 * (e.g. "500000.00000000" for precision 8). Hive-Engine rejects non-string
 * quantities and quantities with wrong decimal counts.
 */
export function sendHiveDeposit(
  account: string,
  params: DepositParams,
): Promise<DepositResult> {
  return new Promise((resolve, reject) => {
    const keychain = getKeychain();
    if (!keychain?.requestCustomJson) {
      reject(
        new Error(
          "Hive Keychain extension not found. Install it at hive-keychain.com.",
        ),
      );
      return;
    }

    const engineId = params.engineId ?? DEFAULT_ENGINE_ID;
    const symbol   = params.token.toUpperCase();
    const to       = params.treasury.trim().toLowerCase();
    const quantity = params.amount.toFixed(params.decimals);
    const memo     = params.memo ?? "";

    const payload = JSON.stringify({
      contractName:    "tokens",
      contractAction:  "transfer",
      contractPayload: { symbol, to, quantity, memo },
    });

    keychain.requestCustomJson(
      account.trim().toLowerCase(),
      engineId,
      "Active",
      payload,
      `Pay ${quantity} ${symbol}`,
      (response) => {
        if (!response.success) {
          reject(
            new Error(
              response.error ??
                response.message ??
                "Keychain signing was cancelled or failed.",
            ),
          );
          return;
        }
        const txId = response.result?.id ?? response.result?.tx_id ?? "";
        if (!txId) {
          reject(new Error("Keychain did not return a transaction id."));
          return;
        }
        resolve({ txId });
      },
    );
  });
}
