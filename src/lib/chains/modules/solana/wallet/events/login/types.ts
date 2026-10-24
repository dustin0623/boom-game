/** Types for the Solana login event. */
import { z } from "zod";

/** Wallets supported for Solana sign-in. */
export const SolanaWalletSchema = z.enum(["phantom", "solflare", "backpack", "metamask"]);
export type SolanaWallet = z.infer<typeof SolanaWalletSchema>;

export type SolanaWalletMeta = {
  id: SolanaWallet;
  label: string;
  /** Where to get the wallet when it is not installed. */
  installUrl: string;
};

/** UI-facing catalogue of supported Solana wallets. */
export const SOLANA_WALLETS: readonly SolanaWalletMeta[] = [
  { id: "phantom", label: "Phantom", installUrl: "https://phantom.app/download" },
  { id: "solflare", label: "Solflare", installUrl: "https://solflare.com/download" },
  { id: "backpack", label: "Backpack", installUrl: "https://backpack.app/downloads" },
  { id: "metamask", label: "MetaMask", installUrl: "https://metamask.io/download" },
] as const;

export type SolanaConnectResult = { address: string; wallet: SolanaWallet };
export type SolanaSignResult = { signature: string };
