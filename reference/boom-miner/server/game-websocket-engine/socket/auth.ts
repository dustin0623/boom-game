/**
 * server/game-websocket-engine/socket/auth.ts
 *
 * Socket.IO middleware that runs before any event handler.
 * Extracts the JWT from socket.handshake.auth.token, verifies it
 * using the same jose + JWT_SECRET that the Next.js app uses, and
 * attaches the decoded wallet to socket.data.wallet.
 *
 * Unauthenticated connections are rejected with an Error before
 * any game logic runs.
 *
 * Security model:
 *   The JWT is the sole authentication gate. A valid signed token can only
 *   be issued by the Next.js server after verifying a wallet signature, so
 *   there is no need for an additional origin allowlist — that check is
 *   redundant and was causing valid connections to be rejected when the
 *   CORS_ORIGIN env var did not exactly match the browser Origin header.
 */

import type { Socket } from "socket.io";
import { verifyToken } from "@/lib/auth/jwt";
import { PROTOCOL_VERSION } from "@/features/game/protocol";

export async function authMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
  const token = socket.handshake.auth?.token as string | undefined;
  if (socket.handshake.auth?.protocolVersion !== PROTOCOL_VERSION)
    return next(new Error("RELOAD_REQUIRED"));

  if (!token) {
    return next(new Error("AUTH_MISSING_TOKEN"));
  }

  const payload = await verifyToken(token);

  if (!payload || !payload.wallet) {
    return next(new Error("AUTH_INVALID_TOKEN"));
  }

  const sessionId = socket.handshake.auth?.sessionId;
  if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 128) {
    return next(new Error("AUTH_INVALID_SESSION"));
  }

  // Bind the client-generated replay namespace to this authenticated socket.
  socket.data.wallet = payload.wallet as string;
  socket.data.sessionId = sessionId;
  next();
}
