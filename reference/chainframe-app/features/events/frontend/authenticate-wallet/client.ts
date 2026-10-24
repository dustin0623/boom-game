"use client";
import { connectHive } from "@/lib/chains/providers/hive/connect";
import { signHiveLogin } from "@/lib/chains/providers/hive/sign";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";
import {
  generateChallenge,
  verifySignature,
  setAuthToken,
  getMe,
  loadAuthToken,
} from "@/lib/api/client";

/** Read only during a browser workflow, never during import or server rendering. */
function referralFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const candidate = new URLSearchParams(window.location.search).get("join");
  if (!candidate) return null;
  try {
    return normalizeHiveUsername(candidate);
  } catch {
    return null;
  }
}

export async function resolveMeStatus(refUsername = referralFromLocation()) {
  try {
    const me = await getMe(refUsername);
    if (me.ok && me.player)
      return {
        isRegistered: me.player.isRegistered,
        referredBy: me.player.referredBy ?? null,
      };
  } catch {
    /* Keep registration unknown after a failed read. */
  }
  return { isRegistered: null, referredBy: null };
}
export async function authenticateWallet(username: string) {
  const refUsername = referralFromLocation();
  const normalized = username.trim().toLowerCase();
  if (!normalized) throw new Error("Hive username is required");
  const wallet = await connectHive(normalized);
  const challenge = await generateChallenge(wallet.address);
  if (!challenge.ok || !challenge.nonce)
    throw new Error(challenge.error || "Could not request a sign-in challenge");
  const signature = await signHiveLogin(wallet.address, challenge.nonce);
  const verify = await verifySignature(wallet.address, signature);
  if (!verify.ok || !verify.token)
    throw new Error(
      verify.error || "Could not verify your wallet with the server",
    );
  return { address: wallet.address, token: verify.token, refUsername };
}

export async function restoreWalletSession(
  address: string,
  isCurrent: () => boolean,
) {
  if (!isCurrent()) throw new Error("Wallet session changed");
  const refUsername = referralFromLocation();
  const token = loadAuthToken();
  if (token) {
    let me = await getMe();
    if (!isCurrent()) throw new Error("Wallet session changed");
    if (me.ok && me.player?.address === address) {
      // A saved bearer may belong to another wallet: verify its subject before attribution.
      if (refUsername && !me.player.isRegistered && !me.player.referredBy) {
        me = await getMe(refUsername);
        if (!isCurrent()) throw new Error("Wallet session changed");
        if (!me.ok || me.player?.address !== address)
          throw new Error("Could not load referral attribution");
      }
      return {
        apiConnected: true,
        isRegistered: me.player?.isRegistered ?? null,
        referredBy: me.player?.referredBy ?? null,
      };
    }
    setAuthToken(null);
  }
  const result = await authenticateWallet(address);
  if (!isCurrent()) throw new Error("Wallet session changed");
  if (!result || result.address !== address) {
    setAuthToken(null);
    return { apiConnected: false, isRegistered: null, referredBy: null };
  }
  setAuthToken(result.token);
  const status = await resolveMeStatus(refUsername);
  if (!isCurrent()) throw new Error("Wallet session changed");
  return { apiConnected: true, ...status };
}
