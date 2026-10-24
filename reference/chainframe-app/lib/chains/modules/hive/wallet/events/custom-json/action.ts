import type { KeychainCustomJsonRawInput } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";
import { describeKeychainError } from "@/lib/utils/hive/error";
import type { CustomJsonBroadcastResult } from "../../types";

export async function broadcastCustomJson(
  input: KeychainCustomJsonRawInput,
): Promise<CustomJsonBroadcastResult> {
  let account: string;
  try {
    account = normalizeHiveUsername(
      input.username,
      "Enter a valid Hive username",
    );
  } catch (error) {
    return {
      ok: false,
      username: input.username.trim().toLowerCase(),
      status: "failed",
      error: error instanceof Error ? error.message : "Invalid Hive request",
    };
  }
  if (!hiveClient.keychain.isAvailable())
    return {
      ok: false,
      username: account,
      status: "unavailable",
      error: "Hive Keychain is not installed",
    };
  try {
    const response = await hiveClient.keychain.customJsonRaw({
      ...input,
      username: account,
    });
    return {
      ok: true,
      username: account,
      transactionId: response.transactionId ?? null,
      status: "broadcast",
    };
  } catch (error) {
    const message = describeKeychainError(error);
    const raw = (error as { raw?: { error?: unknown } })?.raw;
    return {
      ok: false,
      username: account,
      status: /cancel/i.test(String(raw?.error ?? "") + " " + message)
        ? "cancelled"
        : "failed",
      error: message,
    };
  }
}
