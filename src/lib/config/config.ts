/**
 * Shared APPLICATION configuration (frontend + server).
 *
 * Chain-specific settings (endpoints, symbols, env var names) live in
 * `src/lib/chains/modules/config.ts`. Never put secrets in either file.
 */
export type ChainProvider = "solana" | "hive" | "xrpl";

export const config = {
  app: {
    name: "Game",
  },
  auth: {
    /** Email + password login enabled. */
    email: true,
    /**
     * At most ONE blockchain auth provider per app/account.
     * Supported: email only, email + chain, chain only (set email: false).
     */
    chain: "hive" as ChainProvider | null,
    /** Challenge lifetime for wallet signatures. */
    challengeTtlMs: 5 * 60 * 1000,
  },
} as const;
