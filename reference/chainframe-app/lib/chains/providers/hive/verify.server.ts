import { getAccountAuthority } from "@/lib/chains/modules/hive/server/events/get-account-authority/action";
import {
  recoverHiveSigningKey,
  verifyPostingAuthority,
} from "@/lib/utils/hive/signature.server";

/** Verifies Hive ownership only; challenge redemption and JWTs belong to features. */
export async function verifyHiveLogin(input: {
  username: string;
  message: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const signingKey = recoverHiveSigningKey(input.message, input.signature);
  if (!signingKey.ok) return signingKey;
  let authority;
  try {
    authority = await getAccountAuthority(input.username);
  } catch {
    return {
      ok: false,
      error: "Hive account authority is unavailable; try again",
    };
  }
  return verifyPostingAuthority(signingKey.publicKey, authority);
}
