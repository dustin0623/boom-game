// template/lib/auth/session.ts
//
// Small, server-safe internal contract for current-user resolution (Step
// 6.1). Route handlers and server actions call requireSession()
// instead of reaching into jwt.ts or parsing headers themselves, so the
// session provider (JWT today) can change without touching call sites.
import "server-only";
import { verifySession, type SessionPayload } from "./jwt";

export interface AuthContext {
  wallet: string;
  username: string;
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

function toAuthContext(payload: SessionPayload): AuthContext {
  return { wallet: payload.wallet, username: payload.username };
}

/**
 * Resolves the current session or returns a 401 Response. Route handlers
 * should check `"wallet" in result` (or `result instanceof Response`) and
 * return the Response as-is on failure:
 *
 *   const session = await requireSession(request);
 *   if (session instanceof Response) return session;
 */
export async function requireSession(
  request: Request,
): Promise<AuthContext | Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const payload = await verifySession(token);
    return toAuthContext(payload);
  } catch {
    return Response.json(
      { ok: false, error: "Invalid token" },
      { status: 401 },
    );
  }
}
