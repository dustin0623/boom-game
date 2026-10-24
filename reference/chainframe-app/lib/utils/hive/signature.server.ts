import { createHash } from "node:crypto";
import { Signature } from "@hiveio/dhive";
import type { HivePostingAuthority } from "@/lib/chains/modules/hive/server/types";

export function recoverHiveSigningKey(
  message: string,
  signature: string,
): { ok: true; publicKey: string } | { ok: false; error: string } {
  try {
    if (!/^[a-fA-F0-9]{130}$/.test(signature))
      throw new Error("Malformed signature");
    const digest = createHash("sha256").update(message, "utf8").digest();
    const signed = Signature.fromString(signature);
    const recovered = signed.recover(digest);
    if (!recovered.verify(digest, signed)) throw new Error("Invalid signature");
    return { ok: true, publicKey: recovered.toString() };
  } catch {
    return { ok: false, error: "Invalid Hive login signature" };
  }
}
export function verifyPostingAuthority(
  publicKey: string,
  authority: HivePostingAuthority,
): { ok: true } | { ok: false; error: string } {
  if (
    !Number.isSafeInteger(authority.weight_threshold) ||
    authority.weight_threshold < 1 ||
    !Array.isArray(authority.key_auths) ||
    !Array.isArray(authority.account_auths)
  )
    return { ok: false, error: "Invalid Hive Posting authority" };
  const weight =
    authority.key_auths.find(([key]) => key === publicKey)?.[1] ?? 0;
  if (Number.isSafeInteger(weight) && weight >= authority.weight_threshold)
    return { ok: true };
  if (authority.account_auths.length || weight > 0)
    return {
      ok: false,
      error: "Delegated or multi-signature Posting login is unsupported",
    };
  return {
    ok: false,
    error: "Signature does not match this account's Posting authority",
  };
}
