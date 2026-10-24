import { config } from "@/lib/config/config";

/** Runtime validation only; imports and production compilation require no secrets. */
export function getJwtSecret(): string {
  const secret = config.jwtSecret;
  if (
    !secret ||
    secret === "changeme-dev-secret" ||
    new TextEncoder().encode(secret).length < 32
  )
    throw new Error(
      "JWT_SECRET must be configured with at least 32 UTF-8 bytes",
    );
  return secret;
}
