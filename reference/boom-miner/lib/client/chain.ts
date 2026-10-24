"use client";

/**
 * lib/client/chain.ts
 *
 * Reads NEXT_PUBLIC_CHAIN and exports the resolved active chain name for use
 * in client-side code (e.g. ShopModal).
 *
 * CLIENT-SAFE — only reads the NEXT_PUBLIC_ prefixed env var which is baked
 * into the browser bundle at build time.
 */

const raw = (process.env.NEXT_PUBLIC_CHAIN ?? "solana").toLowerCase();

export const activeChain: "solana" | "robinhood" | "hive" =
  raw === "hive" ? "hive" : raw === "robinhood" ? "robinhood" : "solana";
