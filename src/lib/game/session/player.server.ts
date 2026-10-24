import type { PlayerSession, SessionHero } from "./types";

export type PlayerRow = {
  id: string;
  wallet_address: string | null;
  coins: number;
  deposited_balance: number;
  stage: number;
  seed: number;
  destroyed_nodes: string[];
  heroes: unknown;
  token_hash: string;
  last_sync_at: string;
  updated_at: string;
};

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const newSeed = () => Math.floor(Math.random() * 2147483647);

/** Loads a player row only when the browser-held token matches the stored hash. */
export async function loadPlayer(playerId: string, token: string): Promise<PlayerRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (!data || !data.token_hash || data.token_hash !== (await sha256(token))) return null;
  return data as PlayerRow;
}

/** Like loadPlayer but throws — for actions that require a valid session. */
export async function requirePlayer(playerId: string, token: string): Promise<PlayerRow> {
  const row = await loadPlayer(playerId, token);
  if (!row) throw new Error("Invalid session — sign in again");
  return row;
}

export const toSession = (r: PlayerRow): PlayerSession => ({
  playerId: r.id,
  coins: Number(r.coins),
  stage: r.stage,
  seed: Number(r.seed),
  destroyedNodes: r.destroyed_nodes,
  heroes: r.heroes as SessionHero[],
});
