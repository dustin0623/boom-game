import { hiveClient } from "@/lib/chains/modules/hive/client";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";

/** Signs the exact login challenge, preserving the API's serialized SDK response. */
export async function signHiveLogin(
  username: string,
  message: string,
): Promise<string> {
  if (!hiveClient.keychain.isAvailable())
    throw new Error("Hive Keychain is not installed");
  const result = await hiveClient.keychain.requestSignIn({
    username: normalizeHiveUsername(username, "Enter a valid Hive username"),
    message,
    authority: "posting",
  });
  if (result.success !== true || !result.signature)
    throw new Error("Hive Keychain authentication was rejected");
  return JSON.stringify(result);
}
