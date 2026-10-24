/** Browser-facing auth API. Orchestrates chain providers + server functions. */
import type { ChainProvider } from "@/lib/config/config";
import {
  walletChallengeFn,
  walletLoginFn,
  emailLoginFn,
  emailSignupFn,
  xamanStartFn,
  xamanStatusFn,
} from "./auth.functions";
import * as solana from "./solana/sign";
import * as xrpl from "./xrpl/sign";
import { connect as connectHive } from "./hive/connect";
import { sign as signHive } from "./hive/sign";
import { waitForXaman } from "@/lib/chains/modules/xrpl/wallet/events/login/action";
import type { SolanaWallet } from "@/lib/chains/modules/solana/wallet/events/login/types";
import type { XrplWallet, XrplQrPrompt } from "@/lib/chains/modules/xrpl/types";

export { emailLoginFn, emailSignupFn };
export { SOLANA_WALLETS, isSolanaWalletAvailable } from "./solana/sign";
export type { SolanaWallet, SolanaWalletMeta } from "./solana/sign";
export { XRPL_WALLETS } from "./xrpl/sign";
export type { XrplWallet, XrplWalletMeta, XrplQrPrompt } from "./xrpl/sign";

export type WalletLoginOptions = {
  /** Required for Hive: the account name to sign with. */
  hiveUsername?: string;
  /** Which Solana wallet to use: phantom | solflare | backpack | metamask. */
  solanaWallet?: SolanaWallet;
  /** Which XRPL wallet to use: xaman | joey | gemwallet. */
  xrplWallet?: XrplWallet;
  /** Called with a QR code / deep link for mobile wallets (Xaman, Joey). */
  onPrompt?: (p: XrplQrPrompt) => void;
};

/** Full wallet login flow: connect → challenge → sign → verify. */
export async function walletLogin(chain: ChainProvider, options: WalletLoginOptions = {}) {
  const { hiveUsername, solanaWallet = "phantom", xrplWallet = "gemwallet", onPrompt } = options;

  const connected = await (chain === "solana"
    ? solana.connect(solanaWallet)
    : chain === "xrpl"
      ? xrpl.connect(xrplWallet, onPrompt)
      : connectHive(hiveUsername));

  const { address, publicKey } = connected as { address: string; publicKey?: string };
  const { message, token } = await walletChallengeFn({ data: { chain, address } });

  if (chain === "xrpl" && xrplWallet === "xaman") {
    const req = await xamanStartFn({ data: { message, token } });
    onPrompt?.({ wallet: "xaman", qrImage: req.qrImage, deeplink: req.deeplink });
    await waitForXaman((uuid) => xamanStatusFn({ data: { uuid } }), req.uuid);
    return walletLoginFn({ data: { chain, address, message, token, signature: req.uuid, xrplWallet } });
  }

  const { signature } = await (chain === "solana"
    ? solana.sign(address, message, solanaWallet)
    : chain === "xrpl"
      ? xrpl.sign(address, message, xrplWallet)
      : signHive(address, message));

  return walletLoginFn({
    data: { chain, address, message, token, signature, publicKey, xrplWallet: chain === "xrpl" ? xrplWallet : undefined },
  });
}
