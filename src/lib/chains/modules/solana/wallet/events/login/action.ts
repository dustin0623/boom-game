/**
 * Solana login (wallet side): connect + sign the challenge. Browser only.
 *
 * Supported wallets: Phantom, Solflare, Backpack (injected providers) and
 * MetaMask (official Solana client, Wallet Standard features).
 *
 * All four produce a plain ed25519 detached signature over the UTF-8 challenge
 * bytes, so one server-side verifier covers every wallet.
 */
import bs58 from "bs58";
import { solanaChainConfig } from "@/lib/chains/modules/config";
import { SOLANA_WALLETS, type SolanaConnectResult, type SolanaSignResult, type SolanaWallet } from "./types";

export { SOLANA_WALLETS } from "./types";
export type { SolanaWallet, SolanaWalletMeta } from "./types";

/* ------------------------------------------------------------------ utils */

type SignatureLike = Uint8Array | { signature: Uint8Array } | { signature: number[] } | number[] | string;

/** Normalize the many shapes wallets return into a base58 signature string. */
function toBase58Signature(result: SignatureLike): string {
  if (typeof result === "string") return result;
  if (result instanceof Uint8Array) return bs58.encode(result);
  if (Array.isArray(result)) return bs58.encode(Uint8Array.from(result));
  const sig = (result as { signature: Uint8Array | number[] }).signature;
  if (sig instanceof Uint8Array) return bs58.encode(sig);
  if (Array.isArray(sig)) return bs58.encode(Uint8Array.from(sig));
  throw new Error("Wallet returned an unrecognized signature format");
}

function label(wallet: SolanaWallet) {
  return SOLANA_WALLETS.find((w) => w.id === wallet)?.label ?? wallet;
}

function missing(wallet: SolanaWallet): never {
  const meta = SOLANA_WALLETS.find((w) => w.id === wallet);
  throw new Error(`${label(wallet)} wallet not found. Install it from ${meta?.installUrl ?? "the wallet website"}.`);
}

const encode = (message: string) => new TextEncoder().encode(message);

/* ------------------------------------------------- injected wallet adapters */

export type InjectedProvider = {
  isPhantom?: boolean;
  isBackpack?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  signMessage: (msg: Uint8Array, enc?: "utf8") => Promise<SignatureLike>;
  /** Present on Phantom, Solflare and Backpack; used for transfers. */
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }>;
};

type SolanaWindow = {
  phantom?: { solana?: InjectedProvider };
  solana?: InjectedProvider;
  solflare?: InjectedProvider;
  backpack?: InjectedProvider;
};

function injected(wallet: Exclude<SolanaWallet, "metamask">): InjectedProvider {
  if (typeof window === "undefined") missing(wallet);
  const w = window as unknown as SolanaWindow;
  const found =
    wallet === "phantom"
      ? (w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined))
      : wallet === "solflare"
        ? w.solflare
        : (w.backpack ?? (w.solana?.isBackpack ? w.solana : undefined));
  if (!found) missing(wallet);
  return found;
}

/** Shared with other Solana events (transfers) so wallet discovery lives here. */
export function getInjectedSolanaProvider(wallet: Exclude<SolanaWallet, "metamask">): InjectedProvider {
  return injected(wallet);
}

/** Whether an injected provider for this wallet is present in the browser. */
export function isSolanaWalletAvailable(wallet: SolanaWallet): boolean {
  if (typeof window === "undefined") return false;
  // MetaMask is reached through its own client, which handles discovery itself.
  if (wallet === "metamask") return true;
  try {
    injected(wallet);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------- MetaMask adapter */

type StandardAccount = { address: string };
type MetaMaskWallet = {
  features: {
    "standard:connect": { connect: () => Promise<{ accounts: StandardAccount[] }> };
    "solana:signMessage": {
      signMessage: (input: { account: StandardAccount; message: Uint8Array }) => Promise<Array<{ signature: Uint8Array }>>;
    };
  };
};

let metamaskWallet: MetaMaskWallet | null = null;

async function metamask(): Promise<MetaMaskWallet> {
  if (metamaskWallet) return metamaskWallet;
  if (typeof window === "undefined") missing("metamask");
  const { createSolanaClient } = await import("@metamask/connect-solana");
  const client = await createSolanaClient({
    dapp: { name: solanaChainConfig.dappName, url: window.location.origin },
  });
  metamaskWallet = client.getWallet() as unknown as MetaMaskWallet;
  if (!metamaskWallet) missing("metamask");
  return metamaskWallet;
}

/** Test seam: inject a fake MetaMask wallet. */
export function setMetaMaskWallet(wallet: MetaMaskWallet | null) {
  metamaskWallet = wallet;
}

/* ------------------------------------------------------------------ browser */

/** Browser: connect the chosen wallet and return its address. */
export async function connectSolana(wallet: SolanaWallet = "phantom"): Promise<SolanaConnectResult> {
  if (wallet === "metamask") {
    const mm = await metamask();
    const { accounts } = await mm.features["standard:connect"].connect();
    const address = accounts?.[0]?.address;
    if (!address) throw new Error("MetaMask returned no Solana account. Add a Solana account and try again.");
    return { address, wallet };
  }

  const provider = injected(wallet);
  const res = await provider.connect();
  const address = (res as { publicKey?: { toString(): string } } | undefined)?.publicKey?.toString() ?? provider.publicKey?.toString();
  if (!address) throw new Error(`${label(wallet)} did not return an account.`);
  return { address, wallet };
}

/** Browser: sign the login challenge, returning a base58 signature. */
export async function signSolanaLogin(
  address: string,
  message: string,
  wallet: SolanaWallet = "phantom",
): Promise<SolanaSignResult> {
  if (wallet === "metamask") {
    const mm = await metamask();
    const [result] = await mm.features["solana:signMessage"].signMessage({
      account: { address },
      message: encode(message),
    });
    if (!result) throw new Error("MetaMask did not return a signature.");
    return { signature: toBase58Signature(result) };
  }

  const signed = await injected(wallet).signMessage(encode(message), "utf8");
  return { signature: toBase58Signature(signed) };
}

