/**
 * server/game-smart-contract/lib/logger.ts
 *
 * Minimal timestamped logger for the withdrawal sidecar. Kept dependency-free
 * so the sidecar has no logging framework to configure.
 *
 * IMPORTANT: never log the treasury secret key. Callers should only pass
 * non-sensitive fields (signature, wallet, amount, status).
 */

import { config } from "@/lib/config/config";

const CHAIN = config.blockchain.chain.toUpperCase();
const TAG   = `[${CHAIN} Worker]`;

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`${ts()} ${TAG} ${message}`, meta ? redact(meta) : "");
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`${ts()} ${TAG} ${message}`, meta ? redact(meta) : "");
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`${ts()} ${TAG} ${message}`, meta ? redact(meta) : "");
  },
};

/** Defensive redaction in case a secret-ish key ever gets passed in. */
function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[/key|secret|private/i.test(k) ? `${k}<redacted>` : k] =
      /key|secret|private/i.test(k) ? "***" : v;
  }
  return out;
}
