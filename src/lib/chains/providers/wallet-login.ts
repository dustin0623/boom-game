import { config } from "@/lib/config/config";
import type { WalletLogin } from "@/features/types/auth.types";
import {
  playerRepository,
  setSessionToken,
  toPlayer,
  uniqueUsername,
} from "@/lib/modules/players/server.repository";
import { sha256 } from "@/lib/game/session/player.server";
import { consumeChallenge } from "./challenge.server";
import { verify as verifySolana } from "./solana/verify";
import { verify as verifyHive } from "./hive/verify";
import { verify as verifyXrpl } from "./xrpl/verify";

/** Each verifier returns true/false, or the verified address (XRPL: Xaman resolves it). */
const verifiers: Record<WalletLogin["chain"], (i: WalletLogin) => Promise<boolean | string | null>> = {
  solana: verifySolana,
  hive: verifyHive,
  xrpl: verifyXrpl,
};

/**
 * Server: verify a signed challenge and resolve/create the player.
 * Returns the public player plus a game-session token; the database stores
 * only the token's hash, and game server functions require it for every
 * state-changing call.
 */
export async function loginWithWallet(input: WalletLogin) {
  if (config.auth.chain !== input.chain) throw new Error("Chain not enabled");
  await consumeChallenge(input.token, input.chain, input.address, input.message);

  const result = await verifiers[input.chain](input);
  const address = typeof result === "string" ? result : result ? input.address : null;
  if (!address) throw new Error("Signature verification failed");

  const existing = await playerRepository.findByWallet(address);
  const player = existing
    ? await playerRepository.touchLogin(existing.id)
    : await playerRepository.create({
        username: await uniqueUsername(input.chain === "hive" ? address : address.slice(0, 12)),
        displayName: input.chain === "hive" ? `@${address}` : `${address.slice(0, 4)}…${address.slice(-4)}`,
        walletAddress: address,
        email: null,
        passwordHash: null,
      });

  const sessionToken = crypto.randomUUID() + crypto.randomUUID();
  await setSessionToken(player.id, await sha256(sessionToken));
  return { player: toPlayer(player), token: sessionToken };
}
