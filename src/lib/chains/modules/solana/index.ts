/**
 * Public API of the Solana chain module. Mainnet only.
 * Browser code imports `./wallet`, server code imports `./server`.
 */
export { getSolanaClient, setSolanaClient, resolveSolanaEndpoint, type SolanaClient } from "./client";
export * from "./types";
export * as wallet from "./wallet";
export * as server from "./server";
