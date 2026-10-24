import { createHash, randomBytes } from "crypto";

/**
 * Generates an unguessable server-side seed component. This MUST be mixed
 * into every seed passed to createSeededRng() for anything that pays out
 * (chests, raids). createSeededRng()'s hash+LCG is a public, reproducible
 * algorithm, so a client that controls 100% of the seed can brute-force
 * seeds offline until one produces the outcome it wants (legendary chest,
 * guaranteed raid win, max stat roll). Mixing in bytes the client cannot
 * predict or influence before the server accepts the request closes that
 * hole while still allowing the client's own seed to contribute (and be
 * logged) for auditability.
 */
export function generateServerSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Deterministic PRNG seeded from a string. Returns a float in [0, 1).
 */
export function createSeededRng(seed: string): () => number {
  let state = 0;
  const hash = createHash("sha256").update(seed).digest("hex");
  for (let i = 0; i < 8; i++) {
    state = (state * 16 + parseInt(hash.slice(i * 2, i * 2 + 2), 16)) >>> 0;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
