import type { PlayerSession, SessionHero } from "./types";

export type PlayerRow = {
  id: string;
  wallet_address: string | null;
  coins: number;
  deposited_balance: number;
  token_hash: string;
  updated_at: string;
};

/** A row from the public.heroes table. */
export type HeroRow = {
  id: string;
  player_id: string;
  minted_number: number | null;
  name: string;
  type: string;
  rarity: string;
  power: number;
  speed: number;
  stamina: number;
  bomb_number: number;
  bomb_range: number;
  max_energy: number;
  energy: number;
  on_map: boolean;
  recovery_at: string;
  skills?: string[] | null;
};

/** A row from the public.stage_maps table. */
export type StageMapRow = {
  player_id: string;
  stage: number;
  seed: number;
  destroyed_nodes: string[];
  last_sync_at: string;
};

export function heroRowToSession(r: HeroRow): SessionHero {
  const hero: SessionHero = {
    id: r.id,
    name: r.name,
    type: r.type,
    rarity: r.rarity,
    power: r.power,
    speed: r.speed,
    stamina: r.stamina,
    bombNumber: r.bomb_number,
    bombRange: r.bomb_range,
    maxEnergy: r.max_energy,
    skills: r.skills ?? [],
    energy: r.energy,
    onMap: r.on_map,
    recoveryAt: new Date(r.recovery_at).getTime(),
  };
  if (r.minted_number != null) hero.mintedNumber = r.minted_number;
  return hero;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const newSeed = () => Math.floor(Math.random() * 2147483647);

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Loads a player row only when the browser-held token matches the stored hash. */
export async function loadPlayer(playerId: string, token: string): Promise<PlayerRow | null> {
  const { data } = await (await db())
    .from("players")
    .select("id, wallet_address, coins, deposited_balance, token_hash, updated_at")
    .eq("id", playerId)
    .maybeSingle();
  if (!data || !data.token_hash || data.token_hash !== (await sha256(token))) return null;
  return data as PlayerRow;
}

/** Like loadPlayer but throws — for actions that require a valid session. */
export async function requirePlayer(playerId: string, token: string): Promise<PlayerRow> {
  const row = await loadPlayer(playerId, token);
  if (!row) throw new Error("Invalid session — sign in again");
  return row;
}

/** Loads the player's current stage map; creates a fresh stage 1 map if missing. */
export async function loadStageMap(playerId: string): Promise<StageMapRow> {
  const admin = await db();
  const { data } = await admin.from("stage_maps").select("*").eq("player_id", playerId).maybeSingle();
  if (data) return data as StageMapRow;
  const row: StageMapRow = {
    player_id: playerId,
    stage: 1,
    seed: newSeed(),
    destroyed_nodes: [],
    last_sync_at: new Date().toISOString(),
  };
  await admin.from("stage_maps").upsert(row, { onConflict: "player_id", ignoreDuplicates: true });
  const { data: saved } = await admin.from("stage_maps").select("*").eq("player_id", playerId).maybeSingle();
  return (saved as StageMapRow | null) ?? row;
}

/** Loads the player's heroes, oldest first. */
export async function loadHeroes(playerId: string): Promise<SessionHero[]> {
  const { data } = await (await db())
    .from("heroes")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => heroRowToSession(r as HeroRow));
}

export const toSession = (r: PlayerRow, map: StageMapRow, heroes: SessionHero[]): PlayerSession => ({
  playerId: r.id,
  coins: Number(r.coins),
  stage: map.stage,
  seed: Number(map.seed),
  destroyedNodes: map.destroyed_nodes,
  heroes,
});
