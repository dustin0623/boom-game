/**
 * Shared Solana RPC connection.
 *
 * The endpoint is provider-agnostic: Helius, QuickNode, Alchemy, Triton, or a
 * private validator all speak the same JSON-RPC. Resolution order:
 *
 *   1. SOLANA_RPC_ENDPOINT — a private node URL (key may be embedded as a
 *      query param, or SOLANA_PRIVATE_NODE_API_KEY is appended as `?api-key=`)
 *   2. SOLANA_PRIVATE_NODE_API_KEY — appended to `privateMainnetUrl`
 *   3. publicMainnetUrl — the public endpoint (rate limited; development only)
 *
 * The network is always mainnet — devnet and testnet are never used.
 */
import { Connection } from "@solana/web3.js";
import { chainEnv, solanaChainConfig } from "@/lib/chains/modules/config";

export type SolanaClient = Connection;

let client: SolanaClient | null = null;

const env = (name: string): string | undefined => {
  const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return value && value.trim() ? value.trim() : undefined;
};

/** Append an API key to an endpoint, respecting a key already in the URL. */
function withApiKey(endpoint: string, apiKey?: string): string {
  if (!apiKey) return endpoint;
  if (/[?&](api-key|api_key|apikey)=/i.test(endpoint)) return endpoint;
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}api-key=${apiKey}`;
}

/** Resolve the mainnet RPC URL: private node first, public endpoint last. */
export function resolveSolanaEndpoint(): string {
  const custom = env(chainEnv.solana.rpcEndpoint);
  const apiKey = env(chainEnv.solana.privateNodeApiKey);
  if (custom) return withApiKey(custom, apiKey);

  if (apiKey) return withApiKey(solanaChainConfig.privateMainnetUrl, apiKey);

  return solanaChainConfig.publicMainnetUrl;
}

/** Shared connection, created on first use. */
export function getSolanaClient(): SolanaClient {
  if (!client) {
    client = new Connection(resolveSolanaEndpoint(), {
      commitment: solanaChainConfig.commitment,
    });
  }
  return client;
}

/** Test seam / DI: inject a connection (or null to reset). */
export function setSolanaClient(next: SolanaClient | null) {
  client = next;
}
