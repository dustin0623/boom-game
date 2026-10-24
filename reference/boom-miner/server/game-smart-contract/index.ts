/**
 * server/game-smart-contract/index.ts
 *
 * Entry point for the chain withdrawal settlement worker.
 * Run with: pnpm run server:start
 *
 * Which chain is active is determined entirely by the environment variable
 * NEXT_PUBLIC_CHAIN ("solana" | "robinhood" | "hive", defaults to "solana").
 * Deploy three instances with different NEXT_PUBLIC_CHAIN values to operate
 * all three chains concurrently in separate deployments.
 *
 * Reads from environment (via lib/config):
 *   MONGODB_URI           — MongoDB connection string (required)
 *   NEXT_PUBLIC_CHAIN     — active chain ("solana" | "robinhood" | "hive")
 *
 *   Solana:
 *     SOLANA_RPC_URL      — public JSON-RPC endpoint (defaults to mainnet-beta)
 *     HELIUS_API_KEY      — preferred RPC when set
 *     CONTRACT_ADDRESS    — SPL mint the treasury pays out
 *     TREASURY_KEY        — treasury secret key, base58 or JSON byte array
 *
 *   Robinhood:
 *     ROBINHOOD_RPC_URL   — Robinhood Chain JSON-RPC endpoint
 *     CONTRACT_ADDRESS    — ERC-20 token address
 *     TREASURY_KEY        — treasury private key (hex)
 *
 *   Hive:
 *     HIVE_RPC_NODE       — Hive API node (defaults to api.hive.blog)
 *     HIVE_ENGINE_NODE    — Hive-Engine API node
 *     CONTRACT_ADDRESS    — Hive-Engine token symbol
 *     TREASURY_KEY        — treasury active private key (WIF)
 *     TREASURY_ACCOUNT    — treasury Hive account name
 *
 * OPERATIONAL CONSTRAINT: run exactly ONE instance per deployment to preserve
 * the sequential, oldest-first settlement guarantee.
 */

import { connectDatabase } from "@/lib/config/database";
import { TransactionWorker, logQueueDepth } from "./workers/transaction-worker";
import { sendOnChain } from "./lib/transfers";
import { logger } from "./lib/logger";
import { config } from "@/lib/config/config";

async function main(): Promise<void> {
  logger.info(`Starting on chain: ${config.blockchain.chain}`);

  await connectDatabase();
  logger.info("MongoDB connected");

  await logQueueDepth();

  const worker = new TransactionWorker(sendOnChain);
  worker.start();

  const shutdown = (signal: string) => {
    logger.info(`${signal} received — stopping worker`);
    worker.stop();
    setTimeout(() => process.exit(0), 500);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("fatal startup error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
