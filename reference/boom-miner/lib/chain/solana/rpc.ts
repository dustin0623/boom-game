/**
 * lib/chain/solana/rpc.ts
 *
 * Solana connection + treasury signer accessors.
 *
 * SERVER-ONLY — reads the treasury secret key from config. Never import this
 * from a 'use client' file.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { config } from "@/lib/config/config";

const solana = config.blockchain.solana;

// ---------------------------------------------------------------------------
// Connection — lazily created, reused across calls.
// "confirmed" gives a good latency/finality tradeoff for payouts.
//
// SERVER-ONLY endpoint: prefer Helius (reliable, higher rate limits) for the
// treasury payout + on-chain verification path. Falls back to the public RPC
// (config.blockchain.solana.rpcUrl) when no Helius key is configured. The
// Helius key never leaves the server — the browser gets the public rpcUrl.
// ---------------------------------------------------------------------------

function resolveServerRpcUrl(): string {
  if (solana.heliusApiKey) {
    // Match the network of the configured public RPC (mainnet vs devnet).
    const host = solana.rpcUrl.includes("devnet")
      ? "devnet.helius-rpc.com"
      : "mainnet.helius-rpc.com";
    return `https://${host}/?api-key=${solana.heliusApiKey}`;
  }
  return solana.rpcUrl;
}

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(resolveServerRpcUrl(), "confirmed");
  }
  return _connection;
}

// ---------------------------------------------------------------------------
// Treasury signer — supports both encodings of TREASURY_KEY:
//   1. base58 string  (Phantom-style secret key export)
//   2. JSON byte array "[12,34,...]" (solana-keygen / CLI export)
// Lazy so the key is only required at call time, not at build/import time.
// ---------------------------------------------------------------------------

let _treasury: Keypair | null = null;

function decodeSecretKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("TREASURY_KEY env var is not set");

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return Uint8Array.from(arr);
  }
  return bs58.decode(trimmed);
}

export function getTreasuryKeypair(): Keypair {
  if (!_treasury) {
    _treasury = Keypair.fromSecretKey(decodeSecretKey(config.blockchain.treasuryKey));
  }
  return _treasury;
}

/** The Token-2022 mint the treasury pays out, as a PublicKey. */
export function getMintPublicKey(): PublicKey {
  if (!solana.mint) throw new Error("CONTRACT_ADDRESS is not set");
  return new PublicKey(solana.mint);
}

/**
 * Fetches the live on-chain decimals for the configured mint using
 * TOKEN_2022_PROGRAM_ID (required for Pump.fun / Token-2022 mints).
 * Result is NOT cached — callers should store it for the duration of a request.
 */
export async function getMintDecimals(): Promise<number> {
  const mintInfo = await getMint(
    getConnection(),
    getMintPublicKey(),
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  return mintInfo.decimals;
}
