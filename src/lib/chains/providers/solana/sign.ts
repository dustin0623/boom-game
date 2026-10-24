/** Browser: Solana connect + login signing, delegated to the module login event. */
export {
  connectSolana as connect,
  signSolanaLogin as sign,
  isSolanaWalletAvailable,
  SOLANA_WALLETS,
} from "@/lib/chains/modules/solana/wallet/events/login/action";
export type { SolanaWallet, SolanaWalletMeta } from "@/lib/chains/modules/solana/wallet/events/login/types";
