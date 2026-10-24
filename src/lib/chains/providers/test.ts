import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { deriveKeypair, generateSeed, sign, deriveAddress } from "ripple-keypairs";
// dhive is a dev-only dependency: used here to produce reference Hive
// signatures so the SDK-based verifier can be checked against a known-good
// implementation. Application code never imports it.
import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import { verifySolanaSignature } from "@/lib/chains/modules/solana/server";
import { verifyXrplSignature } from "@/lib/chains/modules/xrpl/server";
import { recoverHivePublicKey } from "@/lib/chains/modules/hive/server";
import { hashPassword, verifyPassword } from "./email/password";
import { createChallenge, consumeChallenge } from "./challenge.server";

const msg = "Sign in\nNonce: 1";
const hex = (s: string) => Buffer.from(s, "utf8").toString("hex").toUpperCase();

describe("auth providers", () => {
  it("email password hash", async () => {
    const h = await hashPassword("password123");
    expect(await verifyPassword("password123", h)).toBe(true);
    expect(await verifyPassword("wrong-pass", h)).toBe(false);
  });

  it("solana signature", () => {
    const kp = nacl.sign.keyPair();
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey));
    const addr = bs58.encode(kp.publicKey);
    expect(verifySolanaSignature(addr, msg, sig)).toBe(true);
    expect(verifySolanaSignature(addr, msg + "x", sig)).toBe(false);
  });

  it("xrpl signature", () => {
    const kp = deriveKeypair(generateSeed());
    const addr = deriveAddress(kp.publicKey);
    const sig = sign(hex(msg), kp.privateKey);
    expect(verifyXrplSignature(addr, kp.publicKey, msg, sig)).toBe(true);
    expect(verifyXrplSignature("rWrongAddress", kp.publicKey, msg, sig)).toBe(false);
  });

  it("hive recover key", () => {
    const key = PrivateKey.fromSeed("test-seed");
    const sig = key.sign(cryptoUtils.sha256(msg)).toString();
    expect(recoverHivePublicKey(msg, sig)).toBe(key.createPublic().toString());
    expect(recoverHivePublicKey(msg + "x", sig)).not.toBe(key.createPublic().toString());
    expect(recoverHivePublicKey(msg, "not-a-signature")).toBeNull();
  });

  it("challenge is single-use and bound", async () => {
    const c = await createChallenge("solana", "abc");
    await expect(consumeChallenge(c.token, "solana", "other", c.message)).rejects.toThrow();
    await consumeChallenge(c.token, "solana", "abc", c.message);
    await expect(consumeChallenge(c.token, "solana", "abc", c.message)).rejects.toThrow();
  });
});
