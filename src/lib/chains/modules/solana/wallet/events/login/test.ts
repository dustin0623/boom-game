import { describe, expect, it, beforeEach, afterEach } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { verifySolanaSignature } from "../../../server/events/login/action";
import {
  connectSolana,
  signSolanaLogin,
  isSolanaWalletAvailable,
  setMetaMaskWallet,
  SOLANA_WALLETS,
} from "./action";

const msg = "Sign in to Lovable Game\nNonce: 42";
const keypair = nacl.sign.keyPair();
const address = bs58.encode(keypair.publicKey);
const signBytes = (m: string) => nacl.sign.detached(new TextEncoder().encode(m), keypair.secretKey);

/** Minimal injected provider returning one of the shapes real wallets use. */
function fakeInjected(shape: "object" | "raw" | "array") {
  return {
    publicKey: { toString: () => address },
    connect: async () => ({ publicKey: { toString: () => address } }),
    signMessage: async (m: Uint8Array) => {
      const sig = nacl.sign.detached(m, keypair.secretKey);
      if (shape === "raw") return sig;
      if (shape === "array") return Array.from(sig);
      return { signature: sig };
    },
  };
}

const win = () => globalThis as unknown as Record<string, unknown>;

beforeEach(() => {
  win()["window"] = { location: { origin: "https://example.test" } };
});

afterEach(() => {
  delete win()["window"];
  setMetaMaskWallet(null);
});

describe("solana login event", () => {
  it("lists the four supported wallets", () => {
    expect(SOLANA_WALLETS.map((w) => w.id)).toEqual(["phantom", "solflare", "backpack", "metamask"]);
  });

  it("connects and signs with phantom", async () => {
    (win()["window"] as Record<string, unknown>)["phantom"] = { solana: fakeInjected("object") };
    const connected = await connectSolana("phantom");
    expect(connected).toEqual({ address, wallet: "phantom" });
    const { signature } = await signSolanaLogin(address, msg, "phantom");
    expect(verifySolanaSignature(address, msg, signature)).toBe(true);
  });

  it("connects and signs with solflare (raw Uint8Array signature)", async () => {
    (win()["window"] as Record<string, unknown>)["solflare"] = fakeInjected("raw");
    expect((await connectSolana("solflare")).wallet).toBe("solflare");
    const { signature } = await signSolanaLogin(address, msg, "solflare");
    expect(verifySolanaSignature(address, msg, signature)).toBe(true);
  });

  it("connects and signs with backpack (number[] signature)", async () => {
    (win()["window"] as Record<string, unknown>)["backpack"] = fakeInjected("array");
    expect((await connectSolana("backpack")).wallet).toBe("backpack");
    const { signature } = await signSolanaLogin(address, msg, "backpack");
    expect(verifySolanaSignature(address, msg, signature)).toBe(true);
  });

  it("connects and signs with metamask via wallet standard features", async () => {
    setMetaMaskWallet({
      features: {
        "standard:connect": { connect: async () => ({ accounts: [{ address }] }) },
        "solana:signMessage": {
          signMessage: async ({ message }) => [{ signature: nacl.sign.detached(message, keypair.secretKey) }],
        },
      },
    });
    const connected = await connectSolana("metamask");
    expect(connected).toEqual({ address, wallet: "metamask" });
    const { signature } = await signSolanaLogin(address, msg, "metamask");
    expect(verifySolanaSignature(address, msg, signature)).toBe(true);
  });

  it("reports a helpful error when the wallet is missing", async () => {
    await expect(connectSolana("solflare")).rejects.toThrow(/Solflare wallet not found/);
    expect(isSolanaWalletAvailable("solflare")).toBe(false);
  });

  it("rejects tampered messages, wrong keys and malformed input", () => {
    const signature = bs58.encode(signBytes(msg));
    expect(verifySolanaSignature(address, msg + "x", signature)).toBe(false);
    expect(verifySolanaSignature(bs58.encode(nacl.sign.keyPair().publicKey), msg, signature)).toBe(false);
    expect(verifySolanaSignature(address, msg, "not-base58-!!")).toBe(false);
    expect(verifySolanaSignature("short", msg, signature)).toBe(false);
  });
});
