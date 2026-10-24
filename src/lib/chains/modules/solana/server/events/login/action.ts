/** Solana login (server side): verify an ed25519 detached signature from any supported wallet. */
import bs58 from "bs58";
import nacl from "tweetnacl";

const encode = (message: string) => new TextEncoder().encode(message);


/** Server: verify an ed25519 signature (base58) from any Solana wallet. */
export function verifySolanaSignature(address: string, message: string, signatureB58: string): boolean {
  try {
    const publicKey = bs58.decode(address);
    const signature = bs58.decode(signatureB58);
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    return nacl.sign.detached.verify(encode(message), signature, publicKey);
  } catch {
    return false;
  }
}
