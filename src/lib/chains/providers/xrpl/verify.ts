import {
  verifyXrplSignature,
  verifyXrplSignedTx,
  verifyXamanSignIn,
} from "@/lib/chains/modules/xrpl/server/events/login/action";
import type { WalletLogin } from "@/features/types/auth.types";

/**
 * Server: verify an XRPL login via the module login event.
 * Returns the verified account address, or null.
 */
export async function verify(input: WalletLogin): Promise<string | null> {
  switch (input.xrplWallet ?? "gemwallet") {
    case "xaman":
      // signature = Xaman request uuid; Xaman confirms the signer server-to-server.
      return verifyXamanSignIn(input.signature, input.token);
    case "joey":
      return verifyXrplSignedTx(input.address, input.message, input.signature) ? input.address : null;
    default:
      return input.publicKey && verifyXrplSignature(input.address, input.publicKey, input.message, input.signature)
        ? input.address
        : null;
  }
}
