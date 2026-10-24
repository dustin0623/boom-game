import { cookies } from "next/headers";
import { apiOk, apiError } from "@/lib/api/error-response";
import { signToken } from "@/lib/auth/jwt";
import { findPlayerByWallet, createPlayer } from "@/lib/modules/players/repository.server";
import { verifyWalletSignature, getActiveChain } from "@/lib/auth/verify-signature.server";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", "INVALID_JSON", 400);
  }

  const { wallet, username, signature, message } = (body ?? {}) as Record<string, unknown>;

  if (!wallet || typeof wallet !== "string" || !wallet.trim()) {
    return apiError("wallet is required", "INVALID_WALLET", 400);
  }

  const chain         = getActiveChain();
  // Preserve the exact wallet casing as sent by the wallet provider.
  // Hero documents store ownerWallet with the same casing as player.wallet,
  // and repository queries use case-insensitive matching for safety.
  const trimmedWallet = wallet.trim();

  // Verify cryptographic ownership when signature is provided.
  if (signature && message) {
    const valid = await verifyWalletSignature({
      chain,
      wallet:    trimmedWallet,
      message:   String(message),
      signature: String(signature),
    });
    if (!valid) {
      return apiError("Signature verification failed.", "INVALID_SIGNATURE", 401);
    }
  } else if (process.env.NODE_ENV === "production") {
    return apiError("Signature required in production.", "SIGNATURE_REQUIRED", 400);
  }

  // Idempotent — return existing player if already registered.
  let player = await findPlayerByWallet(trimmedWallet);
  const isNew = !player;

  if (isNew) {
    player = await createPlayer({
      wallet:   trimmedWallet,
      username: typeof username === "string" ? username.trim() || undefined : undefined,
    });
  }

  const token = await signToken({ wallet: trimmedWallet });

  const cookieStore = await cookies();
  cookieStore.set("bm_token", token, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7,
  });

  return apiOk({
    status: isNew ? "ok" : "already-registered",
    chain,
    player: {
      wallet:   trimmedWallet,
      username: (player as { username?: string })?.username ?? null,
      coins:    (player as { coins: number }).coins,
      stage:    (player as { stage: number }).stage,
    },
    token,
  });
}
