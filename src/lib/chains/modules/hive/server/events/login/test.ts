import { describe, expect, it } from "vitest";
import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import { verifyHiveSignature, recoverHivePublicKey } from "./action";
import type { HiveClient } from "../../../client";

const message = "Sign in to the game\nNonce: abc123";
const key = PrivateKey.fromSeed("hive-auth-test");
const publicKey = key.createPublic().toString();
const signature = key.sign(cryptoUtils.sha256(message)).toString();

/** Minimal stand-in for the SDK client: only `rpc.call` is exercised. */
function stubClient(keys: string[]): HiveClient {
  return {
    rpc: {
      call: async () => [
        { posting: { key_auths: keys.map((k) => [k, 1]) }, active: { key_auths: [] } },
      ],
    },
  } as unknown as HiveClient;
}

describe("hive auth verify", () => {
  it("recovers the signing public key", () => {
    expect(recoverHivePublicKey(message, signature)).toBe(publicKey);
  });

  it("accepts a signature from a key on the account", async () => {
    expect(await verifyHiveSignature("alice", message, signature, stubClient([publicKey]))).toBe(true);
  });

  it("rejects a key that is not on the account", async () => {
    const other = PrivateKey.fromSeed("someone-else").createPublic().toString();
    expect(await verifyHiveSignature("alice", message, signature, stubClient([other]))).toBe(false);
  });

  it("rejects a tampered message", async () => {
    expect(await verifyHiveSignature("alice", message + "!", signature, stubClient([publicKey]))).toBe(false);
  });

  it("rejects a malformed signature", async () => {
    expect(await verifyHiveSignature("alice", message, "zzzz", stubClient([publicKey]))).toBe(false);
  });

  it("returns false when the account lookup fails", async () => {
    const failing = { rpc: { call: async () => { throw new Error("rpc down"); } } } as unknown as HiveClient;
    expect(await verifyHiveSignature("alice", message, signature, failing)).toBe(false);
  });
});
