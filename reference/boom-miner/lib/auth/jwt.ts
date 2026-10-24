import { SignJWT, jwtVerify } from "jose";
import { config } from "@/lib/config/config";

const secret = new TextEncoder().encode(config.jwtSecret);

export interface JwtPayload {
  wallet: string;
  [key: string]: unknown;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
