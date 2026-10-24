/** Browser: XRPL connect + login signing, delegated to the module login event. */
import {
  connectXrpl,
  signXrplLogin,
  connectJoey,
  signJoeyLogin,
  type XrplWallet,
  type XrplQrPrompt,
} from "@/lib/chains/modules/xrpl/wallet/events/login/action";

export { XRPL_WALLETS } from "@/lib/chains/modules/xrpl/wallet/events/login/action";
export type { XrplWallet, XrplWalletMeta, XrplQrPrompt } from "@/lib/chains/modules/xrpl/wallet/events/login/action";

/** Xaman resolves the account only after signing, so connect happens server-side. */
export const XAMAN_PENDING_ADDRESS = "xaman";

export async function connect(wallet: XrplWallet = "gemwallet", onPrompt?: (p: XrplQrPrompt) => void) {
  if (wallet === "joey") return connectJoey(onPrompt);
  if (wallet === "xaman") return { address: XAMAN_PENDING_ADDRESS };
  return connectXrpl();
}

export async function sign(address: string, message: string, wallet: XrplWallet = "gemwallet") {
  if (wallet === "joey") return signJoeyLogin(address, message);
  return signXrplLogin(address, message);
}
