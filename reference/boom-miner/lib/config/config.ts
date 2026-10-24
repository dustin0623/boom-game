/**
 * Central configuration — the ONLY place that reads process.env.
 * All other modules must import from here.
 * Server-only: never import this from a 'use client' file.
 */

export type SupportedChain = "solana" | "robinhood" | "hive";

/**
 * Parses an env var that must be a positive integer.
 * Returns `fallback` when the var is absent or empty.
 * Throws a descriptive error at startup when it is set but invalid,
 * preventing silent NaN propagation into provider/parseUnits calls.
 */
function requirePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Config error: ${name}="${raw}" is not a valid positive integer`);
  }
  return n;
}

function resolveChain(): SupportedChain {
  // NEXT_PUBLIC_CHAIN is readable in both server and client contexts.
  // CHAIN (without prefix) is server-only and used as a fallback.
  const raw = (
    process.env.NEXT_PUBLIC_CHAIN ??
    process.env.CHAIN ??
    "solana"
  ).toLowerCase();

  if (raw === "hive")      return "hive";
  if (raw === "robinhood") return "robinhood";
  return "solana";
}

export const config = {
  mongoUri:  process.env.MONGODB_URI!,
  jwtSecret: process.env.JWT_SECRET ?? "changeme-dev-secret",

  // ---- Withdrawal worker tuning ---------------------------------------------
  // Hardcoded operational knobs (not env-configurable). No daily withdrawal
  // limit is enforced for now — see lib/modules/players/repository.server.ts.
  withdrawal: {
    // Worker poll interval (ms) for draining the pending queue.
    workerPollMs: 5000,
    // Max retries before a queued withdrawal is dead-lettered.
    maxRetries: 8,
  },

  // ---- Mint worker tuning ---------------------------------------------------
  // Hardcoded operational knobs (not env-configurable).
  mint: {
    // Max retries before a queued mint is dead-lettered. Higher than the
    // withdrawal ceiling so a slow-to-confirm on-chain payment (retried once
    // per poll) isn't dead-lettered before it lands.
    workerMaxRetries: 30,
    // Confirmation polls per drain attempt. Kept small — the queue's poll
    // interval provides the real backoff between attempts.
    verifyMaxTries: 2,
  },

  blockchain: {
    chain:            resolveChain(),
    contractAddress:  process.env.CONTRACT_ADDRESS!,
    treasuryAddress:  process.env.TREASURY_ADDRESS!,
    treasuryKey:      process.env.TREASURY_KEY!,

    // ---- Per-chain settings (only the active chain's block is used) --------
    // Each lib/chain/<chain> module reads its own block plus the shared
    // treasuryAddress / treasuryKey above.

    solana: {
      // Public JSON-RPC endpoint (mainnet-beta default; override for devnet).
      // This one is surfaced to the browser for the deposit flow, so it must
      // NOT contain any secret — keep it a plain public endpoint.
      rpcUrl:   process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
      // Helius API key — SERVER-ONLY. Used to build a reliable RPC endpoint for
      // transaction verification and treasury payouts. Never sent to the client.
      heliusApiKey: process.env.HELIUS_API_KEY ?? "",
      // Token-2022 (Pump.fun) mint the treasury pays out — the generic CONTRACT_ADDRESS.
      // Decimals are fetched live from chain via getMintDecimals() in lib/chain/solana/rpc.ts
      // and are NOT stored here — do not hardcode them.
      mint: process.env.CONTRACT_ADDRESS ?? "",
    },

    robinhood: {
      rpcUrl:       process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com/",
      chainId:      requirePositiveInt("ROBINHOOD_CHAIN_ID",      process.env.ROBINHOOD_CHAIN_ID,      4663),
      // ERC-20 token contract. Falls back to the generic CONTRACT_ADDRESS.
      tokenAddress: process.env.ROBINHOOD_TOKEN_ADDRESS ?? process.env.CONTRACT_ADDRESS ?? "",
      decimals:     requirePositiveInt("ROBINHOOD_TOKEN_DECIMALS", process.env.ROBINHOOD_TOKEN_DECIMALS, 18),
    },

    hive: {
      // Comma-separated list of Hive API nodes for consensus-layer broadcast.
      rpcNodes:     (process.env.HIVE_RPC_NODES ?? "https://api.hive.blog").split(",").map((s) => s.trim()).filter(Boolean),
      // Hive-Engine (layer-2) sidechain RPC + custom_json id.
      engineRpcUrl: process.env.HIVE_ENGINE_RPC_URL ?? "https://api.hive-engine.com/rpc",
      engineId:     process.env.HIVE_ENGINE_ID ?? "ssc-mainnet-hive",
      // Hive-Engine token symbol the treasury pays out. Falls back to CONTRACT_ADDRESS.
      tokenSymbol:  process.env.HIVE_TOKEN_SYMBOL ?? process.env.CONTRACT_ADDRESS ?? "",
      // Token precision (decimal places) as configured on Hive-Engine.
      precision:    Number(process.env.HIVE_TOKEN_PRECISION ?? 8),
    },
  },
} as const;
