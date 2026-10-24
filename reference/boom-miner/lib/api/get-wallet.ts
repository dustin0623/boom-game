/**
 * lib/api/get-wallet.ts
 *
 * Shared utility to extract the authenticated wallet address from a request.
 * Checks the Authorization header first, then falls back to the bm_token cookie.
 *
 * Returns null if no valid token is found — callers should return 401 in that case.
 */

import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectDatabase } from "@/lib/config/database";

export async function getWallet(req: Request): Promise<string | null> {
  // Establish the DB connection once at the request boundary so that all
  // downstream repository calls can skip their own connectDatabase() calls.
  await connectDatabase();

  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    // Return the wallet exactly as stored in the JWT — preserving the original
    // casing from the player document. Hero queries use case-insensitive
    // matching so any casing difference between MetaMask / WalletConnect is handled
    // at query time without mutating the canonical wallet identity.
    if (payload?.wallet) return payload.wallet;
  }

  // 2. bm_token cookie fallback
  const cookieStore = await cookies();
  const token = cookieStore.get("bm_token")?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.wallet) return payload.wallet;
  }

  return null;
}
