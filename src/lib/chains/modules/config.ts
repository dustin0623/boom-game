/**
 * Chain-specific configuration.
 *
 * `src/lib/config/config.ts` holds APPLICATION configuration.
 * This file holds everything that is specific to a blockchain: endpoints,
 * token symbols, precisions, application ids and the NAMES of the server-only
 * environment variables used for signing.
 *
 * Never put secret values here — only environment variable names. Keys are
 * resolved lazily, server-side, by the chain module at signing time.
 */

/** Server-only env var names. Values are read inside server code only. */
export const chainEnv = {
  hive: {
    /** Optional RPC endpoint override. */
    endpoint: "HIVE_RPC_ENDPOINT",
    /** Treasury account name + active key (used by the transaction worker). */
    treasuryAccount: "HIVE_TREASURY_ACCOUNT",
    treasuryKey: "HIVE_TREASURY_ACTIVE_KEY",
  },
  solana: {
    /** Full mainnet RPC URL for any provider (Helius, QuickNode, Alchemy, ...). */
    rpcEndpoint: "SOLANA_RPC_ENDPOINT",
    /** API key for the private node (Helius or another RPC provider). */
    privateNodeApiKey: "SOLANA_PRIVATE_NODE_API_KEY",
    /** Treasury wallet used for server-signed payouts. */
    treasuryAddress: "SOLANA_TREASURY_ADDRESS",
    treasurySecretKey: "SOLANA_TREASURY_SECRET_KEY",
  },
  xrpl: {
    /** Xaman developer console (apps.xumm.dev) API key + secret. Server-only. */
    xamanApiKey: "XAMAN_API_KEY",
    xamanApiSecret: "XAMAN_API_SECRET",
  },
} as const;

export const xrplChainConfig = {
  /** Wallets offered for XRPL sign-in, in display order. */
  wallets: ["xaman", "joey", "gemwallet"],
  xamanApiUrl: "https://xumm.app/api/v1/platform",
  /** Xaman sign-in request lifetime (minutes). */
  xamanExpireMinutes: 5,
  walletConnect: {
    /** Reown (WalletConnect) project id is publishable → browser env var. */
    projectIdEnv: "VITE_REOWN_PROJECT_ID",
    chainId: "xrpl:0",
    method: "xrpl_signTransaction",
    metadata: {
      name: "Lovable Game",
      description: "Sign in to Lovable Game",
      icons: [] as string[],
    },
  },
  /** Mobile deep link prefix that opens Joey with a WalletConnect URI. */
  joeyDeeplink: "joey://wc?uri=",
} as const;

export const hiveChainConfig = {
  /**
   * RPC endpoint / beacon URL: the SDK ships sane defaults
   * (https://api.hive.blog + PeakD beacon). Only set these when overriding.
   * `chainEnv.hive.endpoint` names the env var for a runtime override.
   */
  /** custom_json id used for this app's standardized game actions. The SDK
   * requires one — no default exists there. */
  applicationId: "lovable-game",
  /** Backend signing accounts, referenced by alias. */
  accounts: {
    treasury: {
      accountEnv: chainEnv.hive.treasuryAccount,
      keyEnv: chainEnv.hive.treasuryKey,
    },
  },
} as const;

export const solanaChainConfig = {
  /** Shown by MetaMask (and other Wallet Standard wallets) on the connect prompt. */
  dappName: "Lovable Game",
  /** Wallets offered for Solana sign-in, in display order. */
  wallets: ["phantom", "solflare", "backpack", "metamask"],
  /** Mainnet only — devnet and testnet are never used. */
  network: "mainnet-beta",
  commitment: "confirmed",
  /** Private (paid) node: Helius, QuickNode, Alchemy, ... — activated by
   * `chainEnv.solana.privateNodeApiKey`. */
  privateMainnetUrl: "https://mainnet.helius-rpc.com",
  /** Last-resort public endpoint (heavily rate limited). */
  publicMainnetUrl: "https://api.mainnet-beta.solana.com",
  /** Backend signing wallets, referenced by alias. */
  accounts: {
    treasury: {
      addressEnv: chainEnv.solana.treasuryAddress,
      keyEnv: chainEnv.solana.treasurySecretKey,
    },
  },
} as const;

export const chainsConfig = {
  hive: hiveChainConfig,
  solana: solanaChainConfig,
  xrpl: xrplChainConfig,
} as const;
