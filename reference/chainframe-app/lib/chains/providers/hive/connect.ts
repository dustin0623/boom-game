import { hiveClient } from "@/lib/chains/modules/hive/client";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";

/** Checks wallet availability and identity input; does not authenticate ownership. */
export async function connectHive(
  username: string,
): Promise<{ address: string }> {
  if (!hiveClient.keychain.isAvailable())
    throw new Error("Hive Keychain is not installed");
  return {
    address: normalizeHiveUsername(username, "Enter a valid Hive username"),
  };
}
