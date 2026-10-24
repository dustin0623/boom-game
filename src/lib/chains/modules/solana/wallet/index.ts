/** Solana wallet (browser) API: wallet connect, login signing, player transfers. */
export {
  connectSolana,
  signSolanaLogin,
  isSolanaWalletAvailable,
  getInjectedSolanaProvider,
  setMetaMaskWallet,
  SOLANA_WALLETS,
} from "./events/login/action";
export { SolanaWalletSchema } from "./events/login/types";
export type { SolanaWallet, SolanaWalletMeta } from "./events/login/types";
export { transferToken, TransferTokenInput, type WalletTransferResult } from "./events/transfer-token/action";
