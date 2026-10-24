/**
 * lib/appkit/config.ts
 *
 * Reown AppKit (WalletConnect v2) configuration for both chains:
 *   - Robinhood Chain (EVM, chain ID 4663)  → WagmiAdapter
 *   - Solana Mainnet                        → SolanaAdapter
 *
 * `createAppKit` is called once here so the singleton is shared across
 * the entire client bundle.  Import `appKit` only when you need to call
 * appKit.open() / appKit.close() imperatively; prefer the React hooks
 * (useAppKitAccount, useAppKitProvider) in components.
 */

import { WagmiAdapter }  from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana as solanaMainnet } from "@reown/appkit/networks";
import { createAppKit }            from "@reown/appkit/react";
import { cookieStorage, createStorage } from "@wagmi/core";
import { metaMask, injected } from "@wagmi/connectors";
import { defineChain } from "viem";
import { http } from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

// ---------------------------------------------------------------------------
// Robinhood Chain (EVM) — custom viem chain definition
// ---------------------------------------------------------------------------

export const robinhoodChain = defineChain({
  id:   4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ??
        "https://rpc.mainnet.chain.robinhood.com/",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url:  "https://explorer.robinhood.com",
    },
  },
});

// ---------------------------------------------------------------------------
// Wagmi adapter (Robinhood EVM)
// ---------------------------------------------------------------------------

export const wagmiAdapter = new WagmiAdapter({
  networks: [robinhoodChain],
  projectId: WALLETCONNECT_PROJECT_ID,
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  connectors: [
    metaMask(),
    injected(),  // Includes Rabby and other EIP-6963 wallets
  ],
});

// ---------------------------------------------------------------------------
// Solana adapter
// ---------------------------------------------------------------------------

// SolanaAdapter auto-discovers Phantom, Solflare, Backpack and other Wallet Standard wallets
export const solanaAdapter = new SolanaAdapter();

// ---------------------------------------------------------------------------
// AppKit singleton — call once at module load
// ---------------------------------------------------------------------------

// Create AppKit with minimal wallet support
// Disable analytics to prevent fetching 70+ wallets from cloud
export const appKit = createAppKit({
  adapters:  [wagmiAdapter, solanaAdapter],
  networks:  [robinhoodChain, solanaMainnet],
  projectId: WALLETCONNECT_PROJECT_ID,
  features: {
    analytics:    false,
    email:        false,
    socials:      false,
    onramp:       false,
    swaps:        false,
    history:      false,
    send:         false,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-font-family":       "'Press Start 2P', monospace",
    "--w3m-accent":            "#d9854a",
    "--w3m-color-mix":         "#1a0f00",
    "--w3m-color-mix-strength": 20,
    "--w3m-border-radius-master": "2px",
  },
});
