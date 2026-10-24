import { describe, expect, it } from "vitest";
import { deriveKeypair, generateSeed, deriveAddress, sign } from "ripple-keypairs";
import { encode, encodeForSigning } from "ripple-binary-codec";
import { buildLoginTx, verifyXrplSignedTx, verifyXamanSignIn, getXamanStatus } from "./action";

const msg = "Sign in\nNonce: 1";

function signedBlob(message: string) {
  const kp = deriveKeypair(generateSeed());
  const address = deriveAddress(kp.publicKey);
  const tx = { ...buildLoginTx(address, message), Fee: "12", Sequence: 1, SigningPubKey: kp.publicKey };
  const TxnSignature = sign(encodeForSigning(tx as never), kp.privateKey);
  return { address, blob: encode({ ...tx, TxnSignature } as never) };
}

const fakeFetch = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

describe("xrpl login", () => {
  it("joey signed tx verifies", () => {
    const { address, blob } = signedBlob(msg);
    expect(verifyXrplSignedTx(address, msg, blob)).toBe(true);
    expect(verifyXrplSignedTx(address, msg + "x", blob)).toBe(false);
    expect(verifyXrplSignedTx("rWrong", msg, blob)).toBe(false);
  });

  it("xaman sign-in bound to token", async () => {
    process.env["XAMAN_API_KEY"] = "k";
    process.env["XAMAN_API_SECRET"] = "s";
    const signed = { meta: { signed: true }, response: { account: "rAbc" }, custom_meta: { blob: { token: "t1" } } };
    expect(await verifyXamanSignIn("u", "t1", fakeFetch(signed))).toBe("rAbc");
    expect(await verifyXamanSignIn("u", "t2", fakeFetch(signed))).toBeNull();
    expect(await getXamanStatus("u", fakeFetch({ meta: { expired: true } }))).toEqual({ status: "expired" });
    expect(await getXamanStatus("u", fakeFetch({ meta: {} }))).toEqual({ status: "pending" });
  });
});
