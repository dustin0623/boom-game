/** XRPL login (wallet side): GemWallet, Xaman QR wait, Joey (WalletConnect). Browser only. */
import { encode } from "ripple-binary-codec";
import { xrplChainConfig } from "@/lib/chains/modules/config";
import { buildLoginTx } from "../../../utils";
import type { XamanStatus, XrplQrPrompt } from "../../../types";

export { XRPL_WALLETS } from "../../../types";
export type { XrplWallet, XrplWalletMeta, XrplQrPrompt, XamanStatus } from "../../../types";
export { buildLoginTx } from "../../../utils";

/** Browser: GemWallet connect. Imported lazily to keep SSR clean. */
export async function connectXrpl() {
  const gem = await import("@gemwallet/api");
  const installed = await gem.isInstalled();
  if (!installed.result?.isInstalled) throw new Error("GemWallet not found. Install the extension.");
  const res = await gem.getPublicKey();
  if (!res.result) throw new Error("Wallet connection cancelled");
  return { address: res.result.address, publicKey: res.result.publicKey };
}

/** Browser: sign the login challenge with GemWallet. */
export async function signXrplLogin(_address: string, message: string) {
  const gem = await import("@gemwallet/api");
  const res = await gem.signMessage(message);
  if (!res.result?.signedMessage) throw new Error("Signing cancelled");
  return { signature: res.result.signedMessage };
}

/** Browser: wait for the user to sign in Xaman. */
export async function waitForXaman(
  poll: (uuid: string) => Promise<XamanStatus>,
  uuid: string,
  intervalMs = 2000,
  timeoutMs = xrplChainConfig.xamanExpireMinutes * 60_000,
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await poll(uuid);
    if (s.status === "signed") return s.account;
    if (s.status !== "pending") throw new Error(s.status === "expired" ? "Xaman request expired" : "Sign-in rejected in Xaman");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Xaman request expired");
}

type WcClient = Awaited<ReturnType<typeof import("@walletconnect/sign-client").default.init>>;
let wc: { client: WcClient; topic: string } | null = null;

/** Browser: pair with Joey over WalletConnect; shows a QR/deeplink via onPrompt. */
export async function connectJoey(onPrompt?: (p: XrplQrPrompt) => void) {
  const projectId = (import.meta.env as Record<string, string | undefined>)[xrplChainConfig.walletConnect.projectIdEnv];
  if (!projectId) throw new Error("Joey sign-in is not configured yet (missing WalletConnect project id).");
  const { default: SignClient } = await import("@walletconnect/sign-client");
  const client = await SignClient.init({
    projectId,
    metadata: { ...xrplChainConfig.walletConnect.metadata, url: window.location.origin, icons: [...xrplChainConfig.walletConnect.metadata.icons] },
  });
  const { chainId, method } = xrplChainConfig.walletConnect;
  const { uri, approval } = await client.connect({
    requiredNamespaces: { xrpl: { chains: [chainId], methods: [method], events: [] } },
  });
  if (uri) onPrompt?.({ wallet: "joey", qrValue: uri, deeplink: `${xrplChainConfig.joeyDeeplink}${encodeURIComponent(uri)}` });
  const session = await approval();
  const account = session.namespaces["xrpl"]?.accounts[0];
  if (!account) throw new Error("Joey returned no XRPL account");
  wc = { client, topic: session.topic };
  return { address: account.split(":").pop()! };
}

/** Browser: ask Joey to sign (never submit) the login transaction. Returns the signed blob. */
export async function signJoeyLogin(address: string, message: string) {
  if (!wc) throw new Error("Joey is not connected");
  const { chainId, method } = xrplChainConfig.walletConnect;
  const result = (await wc.client.request({
    topic: wc.topic,
    chainId,
    request: { method, params: { tx_json: buildLoginTx(address, message), autofill: true, submit: false } },
  })) as { tx_blob?: string; tx_json?: Record<string, unknown> };
  const blob = result.tx_blob ?? (result.tx_json ? encode(result.tx_json as never) : null);
  if (!blob) throw new Error("Joey returned no signature");
  return { signature: blob };
}
