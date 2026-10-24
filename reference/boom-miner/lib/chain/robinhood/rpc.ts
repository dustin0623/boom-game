/**
 * lib/chain/robinhood/rpc.ts
 *
 * Robinhood Chain (EVM L2, chain id 4663) provider + treasury signer +
 * ERC-20 token contract accessors, built on ethers v6.
 *
 * SERVER-ONLY — reads the treasury private key from config. Never import this
 * from a 'use client' file.
 */

import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { config } from "@/lib/config/config";

const rh = config.blockchain.robinhood;

/** Minimal ERC-20 ABI — only what the payout bridge needs. */
export const ERC20_ABI = [
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
] as const;

// ---------------------------------------------------------------------------
// Provider — read-only RPC. Safe to create eagerly (no key needed).
// staticNetwork avoids an extra eth_chainId round-trip on every call.
// ---------------------------------------------------------------------------

let _provider: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (!_provider) {
    _provider = new JsonRpcProvider(rh.rpcUrl, rh.chainId, {
      staticNetwork: true,
    });
  }
  return _provider;
}

// ---------------------------------------------------------------------------
// Treasury signer — lazy so the private key is only required at call time.
// ---------------------------------------------------------------------------

function normalisePk(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("TREASURY_KEY env var is not set");
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

let _wallet: Wallet | null = null;

export function getTreasuryWallet(): Wallet {
  if (!_wallet) {
    _wallet = new Wallet(normalisePk(config.blockchain.treasuryKey), getProvider());
  }
  return _wallet;
}

/**
 * Resets all cached singletons so the next call to getProvider / getTreasuryWallet
 * / getTokenDecimals creates a fresh connection. Call inside catch blocks in
 * transfer.ts and verify.ts to recover after an RPC error.
 */
export function resetProvider(): void {
  _provider = null;
  _wallet   = null;
  _decimals = null;
}

/** Write-capable token contract bound to the treasury signer. */
export function getTokenContract(): Contract {
  if (!rh.tokenAddress) {
    throw new Error("ROBINHOOD_TOKEN_ADDRESS (or CONTRACT_ADDRESS) is not set");
  }
  return new Contract(rh.tokenAddress, ERC20_ABI, getTreasuryWallet());
}

// ---------------------------------------------------------------------------
// Token decimals — fetched once from the contract and cached.
// Invalidated by resetProvider() so a fresh provider always fetches anew.
// ---------------------------------------------------------------------------

let _decimals: number | null = null;

/**
 * Returns the on-chain decimals for the payout token.
 * Fetches from the contract on first call; subsequent calls return the cached
 * value. Falls back to the config value if the contract call fails.
 */
export async function getTokenDecimals(): Promise<number> {
  if (_decimals !== null) return _decimals;
  try {
    const token = new Contract(rh.tokenAddress, ERC20_ABI, getProvider());
    _decimals = Number(await token.decimals());
  } catch {
    // Fall back to the config value (env var or default 18).
    _decimals = rh.decimals;
  }
  return _decimals;
}

/**
 * @deprecated Use getTokenDecimals() instead. Kept for any remaining callers
 * until they are migrated. Returns the config-time decimals (may be wrong if
 * the env var is unset).
 */
export const TOKEN_DECIMALS = rh.decimals;
