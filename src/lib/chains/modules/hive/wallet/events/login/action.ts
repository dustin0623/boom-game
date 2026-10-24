/** Hive login (wallet side): ask Hive Keychain to sign the login challenge. Browser only. */
import { getHiveClient } from "../../../client";

/**
 * Uses the SDK's Keychain client (extension detection, cancellation handling
 * and response normalisation live there) rather than touching
 * `window.hive_keychain` directly.
 */
export async function signHiveLogin(username: string, message: string): Promise<{ signature: string }> {
  const res = await getHiveClient().keychain.requestSignIn({ username, message, authority: "posting" });
  if (!res.signature) throw new Error("Signing cancelled");
  return { signature: res.signature };
}
