// template/lib/auth/jwt.ts
//
// Low-level session token primitives. Nothing outside template/lib/auth
// should import "jose" or touch the signing secret directly — route
// handlers and events use the internal contract in session.ts instead.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getJwtSecret } from "./secret.server";

export interface SessionPayload extends JWTPayload {
  wallet: string;
  username: string;
}

export async function createSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
): Promise<string> {
  const secret = new TextEncoder().encode(getJwtSecret());
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const secret = new TextEncoder().encode(getJwtSecret());
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });
  return payload as SessionPayload;
}
