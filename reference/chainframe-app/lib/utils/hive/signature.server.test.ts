import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PrivateKey } from "@hiveio/dhive";
import {
  recoverHiveSigningKey,
  verifyPostingAuthority,
} from "./signature.server";
const key = PrivateKey.fromSeed("login-test-key");
const other = PrivateKey.fromSeed("other-test-key");
const message = "Sign in\nAccount: @alice\nCode: original";
const sign = (text: string, signingKey = key) =>
  signingKey.sign(createHash("sha256").update(text).digest()).toString();
const authority = {
  weight_threshold: 1,
  key_auths: [[key.createPublic().toString(), 1] as [string, number]],
  account_auths: [] as Array<[string, number]>,
};
describe("Hive message proof", () => {
  it("recovers the actual signing key over the exact challenge", () => {
    const proof = recoverHiveSigningKey(message, sign(message));
    expect(proof).toEqual({
      ok: true,
      publicKey: key.createPublic().toString(),
    });
    if (!proof.ok) throw Error("Invalid fixture");
    expect(verifyPostingAuthority(proof.publicKey, authority)).toEqual({
      ok: true,
    });
  });
  it("rejects malformed signatures", () => {
    expect(recoverHiveSigningKey(message, "forged")).toMatchObject({
      ok: false,
    });
  });
  it.each([
    ["wrong signer", message, sign(message, other)],
    ["altered message", message + "tampered", sign(message)],
  ])("rejects %s against Posting authority", (_, text, signature) => {
    const proof = recoverHiveSigningKey(text, signature);
    expect(
      proof.ok && verifyPostingAuthority(proof.publicKey, authority).ok,
    ).toBe(false);
  });
  it("requires sufficient key weight", () => {
    expect(
      verifyPostingAuthority(key.createPublic().toString(), {
        ...authority,
        weight_threshold: 2,
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("multi-signature"),
    });
  });
  it("rejects unsupported delegated authority", () => {
    expect(
      verifyPostingAuthority(key.createPublic().toString(), {
        weight_threshold: 1,
        key_auths: [],
        account_auths: [["delegate", 1]],
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("Delegated") });
  });
  it("rejects malformed authority thresholds", () => {
    expect(
      verifyPostingAuthority(key.createPublic().toString(), {
        ...authority,
        weight_threshold: 0,
      }),
    ).toMatchObject({ ok: false });
  });
});
