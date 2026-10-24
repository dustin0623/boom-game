import { config, type ChainProvider } from "@/lib/config/config";

/**
 * Stateless signed login challenges (HMAC). Server-only.
 * Used nonces are tracked in memory to block replays within one instance.
 */
const usedNonces = new Map<string, number>();

function secret() {
  const s = process.env["AUTH_CHALLENGE_SECRET"];
  if (s) return s;
  return "dev-only-insecure-challenge-secret";
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function buildChallengeMessage(chain: ChainProvider, address: string, nonce: string, expires: number) {
  return [
    `Sign in to ${config.app.name}`,
    `Chain: ${chain}`,
    `Account: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expires).toISOString()}`,
  ].join("\n");
}

export async function createChallenge(chain: ChainProvider, address: string) {
  const nonce = crypto.randomUUID();
  const expires = Date.now() + config.auth.challengeTtlMs;
  const message = buildChallengeMessage(chain, address, nonce, expires);
  const payload = JSON.stringify({ chain, address, nonce, expires });
  const token = `${btoa(payload)}.${await hmac(payload)}`;
  return { message, token };
}

export async function consumeChallenge(token: string, chain: ChainProvider, address: string, message: string) {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) throw new Error("Invalid challenge");
  const payload = atob(b64);
  if ((await hmac(payload)) !== sig) throw new Error("Invalid challenge");
  const data = JSON.parse(payload) as { chain: string; address: string; nonce: string; expires: number };
  if (data.chain !== chain || data.address !== address) throw new Error("Challenge mismatch");
  if (Date.now() > data.expires) throw new Error("Challenge expired");
  if (buildChallengeMessage(chain, address, data.nonce, data.expires) !== message) throw new Error("Challenge mismatch");
  const now = Date.now();
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n);
  if (usedNonces.has(data.nonce)) throw new Error("Challenge already used");
  usedNonces.set(data.nonce, data.expires);
}
