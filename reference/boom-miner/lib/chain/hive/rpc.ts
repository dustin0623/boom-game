/**
 * lib/chain/hive/rpc.ts
 *
 * Hive consensus-layer client (dhive) + Hive-Engine layer-2 accessors +
 * treasury account/key accessors.
 *
 * Token transfers happen on Hive-Engine (an L2 sidechain) via a `custom_json`
 * operation broadcast on the Hive consensus layer with the treasury's ACTIVE
 * key. Balance reads hit the Hive-Engine JSON-RPC contracts API.
 *
 * SERVER-ONLY — reads the treasury active key from config. Never import this
 * from a 'use client' file.
 */

import { Client, PrivateKey } from "@hiveio/dhive";
import { config } from "@/lib/config/config";

const hive = config.blockchain.hive;

// ---------------------------------------------------------------------------
// Dynamic Hive node discovery via https://beacon.peakd.com/api/nodes
//
// Called at the start of each worker drain cycle so broadcast operations
// always use the highest-scoring live nodes rather than a stale hardcoded list.
// Nodes are filtered to score >= 80 with the "broadcast" feature present.
// Falls back to the HIVE_RPC_NODES config value on any fetch error.
// ---------------------------------------------------------------------------

const BEACON_URL = "https://beacon.peakd.com/api/nodes";
const BEACON_CACHE_TTL_MS = 60_000; // refresh at most once per minute

interface BeaconNode {
  endpoint: string;
  score:    number;
  features: string[];
}

let _cachedNodes: string[]  = [];
let _lastFetchAt: number    = 0;

export async function getHiveNodes(): Promise<string[]> {
  const now = Date.now();
  if (_cachedNodes.length > 0 && now - _lastFetchAt < BEACON_CACHE_TTL_MS) {
    return _cachedNodes;
  }
  try {
    const res = await fetch(BEACON_URL, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`beacon status ${res.status}`);
    const nodes = (await res.json()) as BeaconNode[];
    const filtered = nodes
      .filter((n) => n.score >= 80 && Array.isArray(n.features) && n.features.includes("broadcast"))
      .map((n) => n.endpoint);
    if (filtered.length > 0) {
      _cachedNodes = filtered;
      _lastFetchAt = now;
      return _cachedNodes;
    }
  } catch {
    // fall through to config fallback
  }
  // Fallback: use nodes from HIVE_RPC_NODES env
  return hive.rpcNodes;
}

// ---------------------------------------------------------------------------
// Consensus-layer client factory.
//
// makeHiveClient()  — creates a new Client with fresh beacon nodes on every
//   call. Use this in the worker drain cycle so each batch uses live nodes.
//
// getHiveClient()   — cached singleton for one-off calls (backward compat).
//   The singleton is rebuilt whenever getHiveNodes() returns a different list.
// ---------------------------------------------------------------------------

export async function makeHiveClient(): Promise<Client> {
  const nodes = await getHiveNodes();
  return new Client(nodes, {
    timeout:           15_000,
    failoverThreshold: nodes.length > 1 ? nodes.length - 1 : 0,
    consoleOnFailover: false,
  });
}

let _client: Client | null = null;

/** Cached singleton — suitable for one-off balance checks, not drain loops. */
export function getHiveClient(): Client {
  if (!_client) {
    _client = new Client(hive.rpcNodes, {
      timeout:           15_000,
      failoverThreshold: hive.rpcNodes.length > 1 ? hive.rpcNodes.length - 1 : 0,
      consoleOnFailover: false,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Treasury account + signing key.
//   treasuryAddress → Hive account username (payer/sender)
//   treasuryKey     → Hive ACTIVE private key (WIF string)
// Lazy so the key is only parsed at call time, not at build/import time.
// ---------------------------------------------------------------------------

export function getTreasuryAccount(): string {
  const account = config.blockchain.treasuryAddress?.trim();
  if (!account) throw new Error("TREASURY_ADDRESS (Hive account) is not set");
  return account.toLowerCase();
}

let _activeKey: PrivateKey | null = null;

export function getTreasuryActiveKey(): PrivateKey {
  if (!_activeKey) {
    const raw = config.blockchain.treasuryKey?.trim();
    if (!raw) throw new Error("TREASURY_KEY (Hive active key) is not set");
    _activeKey = PrivateKey.fromString(raw);
  }
  return _activeKey;
}

// ---------------------------------------------------------------------------
// Hive-Engine (layer-2) settings.
// ---------------------------------------------------------------------------

/** Hive-Engine JSON-RPC contracts endpoint (used for balance reads + findOne). */
export const ENGINE_RPC_URL = hive.engineRpcUrl;

/**
 * Hive-Engine JSON-RPC blockchain endpoint — used for getTransactionInfo.
 * This is a DIFFERENT endpoint from the contracts endpoint; sscjs routes
 * getTransactionInfo here internally. Typically the same host + /rpc/blockchain.
 */
export const ENGINE_BLOCKCHAIN_URL =
  hive.engineRpcUrl.replace(/\/rpc\/?$/, "/rpc/blockchain");

/** custom_json id that routes an op to the Hive-Engine sidechain. */
export const ENGINE_ID = hive.engineId;

/** Hive-Engine token symbol the treasury pays out. */
export function getTokenSymbol(): string {
  if (!hive.tokenSymbol) throw new Error("HIVE_TOKEN_SYMBOL (or CONTRACT_ADDRESS) is not set");
  return hive.tokenSymbol.toUpperCase();
}

/**
 * Reads the token precision directly from Hive-Engine token metadata.
 * This is the authoritative source — avoids relying on a hardcoded env var.
 * Returns the precision integer (e.g. 3), or falls back to the config value.
 */
export async function getTokenPrecision(symbol: string): Promise<number> {
  try {
    const res = await fetch(ENGINE_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "findOne",
        params: {
          contract: "tokens",
          table: "tokens",
          query: { symbol: symbol.toUpperCase() },
        },
      }),
    });
    if (!res.ok) throw new Error(`RPC error ${res.status}`);
    const json = (await res.json()) as { result?: { precision?: number } | null };
    if (typeof json.result?.precision === "number") return json.result.precision;
  } catch {
    // fall through to config default
  }
  return hive.precision ?? 3;
}

/**
 * Reads a Hive-Engine token balance for `account` via the contracts API.
 * Returns the balance as a number (whole tokens), or 0 if none.
 */
export async function getEngineBalance(account: string, symbol: string): Promise<number> {
  const res = await fetch(ENGINE_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "findOne",
      params: {
        contract: "tokens",
        table: "balances",
        query: { account: account.toLowerCase(), symbol: symbol.toUpperCase() },
      },
    }),
  });

  if (!res.ok) throw new Error(`Hive-Engine RPC error: ${res.status}`);
  const json = (await res.json()) as { result?: { balance?: string } | null };
  return json.result?.balance ? Number(json.result.balance) : 0;
}
