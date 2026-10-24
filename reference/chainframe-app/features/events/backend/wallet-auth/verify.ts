import { playerRepository } from "@/lib/modules/players/server.repository";
import { validateLoginResponse, hashLoginNonce } from "@/lib/auth/login.server";
import { verifyHiveLogin } from "@/lib/chains/providers/hive/verify.server";
import { createSession } from "@/lib/auth/jwt";
export async function verifyLoginSignature(
  username: string,
  signature: string,
) {
  const validated = validateLoginResponse(username, signature);
  if (!validated.ok) return validated;
  const ownership = await verifyHiveLogin({
    username: validated.wallet,
    message: validated.message,
    signature: validated.signature,
  });
  if (!ownership.ok) return ownership;
  const consumed = await playerRepository.consumeLoginNonce(
    validated.wallet,
    hashLoginNonce(validated.jti),
    validated.expiresAt,
    Date.now(),
  );
  if (!consumed)
    return {
      ok: false,
      error: "Invalid, expired, superseded or already used sign-in challenge",
    };
  const payload = { wallet: validated.wallet, username: validated.wallet };
  const token = await createSession(payload);
  return { ok: true, token, payload };
}
