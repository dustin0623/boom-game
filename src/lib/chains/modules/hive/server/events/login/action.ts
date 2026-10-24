/** Hive login (server side): recover the signing key and match it against the account. */
import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import bs58 from "bs58";
import { getHiveClient, type HiveClient } from "../../../client";

// The noble ECDSA API needs a hash function provided by the host app.
secp.hashes.sha256 = sha256;

const PREFIX = "STM";

/** Encode a compressed secp256k1 point as a Hive `STM...` public key. */
function encodeHivePublicKey(pubkey: Uint8Array): string {
  const checksum = ripemd160(pubkey).subarray(0, 4);
  const payload = new Uint8Array(pubkey.length + 4);
  payload.set(pubkey, 0);
  payload.set(checksum, pubkey.length);
  return PREFIX + bs58.encode(payload);
}

/**
 * Recover the `STM...` public key that produced a Keychain
 * `requestSignBuffer` signature over `message`.
 *
 * Hive signatures are 65 bytes: a header byte (27 + recovery + 4 for
 * compressed) followed by the 64-byte compact r||s pair.
 */
export function recoverHivePublicKey(message: string, signatureHex: string): string | null {
  try {
    const sig = hexToBytes(signatureHex);
    if (sig.length !== 65) return null;
    const recovery = (sig[0]! - 31) & 3;
    const recovered = new Uint8Array(65);
    recovered[0] = recovery;
    recovered.set(sig.subarray(1), 1);
    const pubkey = secp.recoverPublicKey(recovered, new TextEncoder().encode(message));
    return encodeHivePublicKey(pubkey);
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(clean.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new Error("Invalid hex");
    out[i] = byte;
  }
  return out;
}

type KeyAuths = { key_auths: Array<[string, number]> };
type HiveAccount = { posting: KeyAuths; active: KeyAuths; owner?: KeyAuths };

/**
 * Server: fetch the posting + active public keys of a Hive account through the
 * shared SDK RPC client (beacon discovery and failover included).
 */
export async function getHiveAccountKeys(username: string, client: HiveClient = getHiveClient()): Promise<string[]> {
  const accounts = (await client.rpc.call("condenser_api.get_accounts", [[username]])) as HiveAccount[] | undefined;
  const account = accounts?.[0];
  if (!account) return [];
  return [...account.posting.key_auths, ...account.active.key_auths].map(([key]) => key);
}

/** Server: true when `signatureHex` over `message` came from a key of `username`. */
export async function verifyHiveSignature(
  username: string,
  message: string,
  signatureHex: string,
  client: HiveClient = getHiveClient(),
): Promise<boolean> {
  const pubkey = recoverHivePublicKey(message, signatureHex);
  if (!pubkey) return false;
  try {
    return (await getHiveAccountKeys(username, client)).includes(pubkey);
  } catch {
    return false;
  }
}
