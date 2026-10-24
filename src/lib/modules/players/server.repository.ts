import { rollSeed } from "@/lib/game/dungeon/generate";
import { starterHeroes } from "@/lib/game/session/starter";
import { PlayerDocumentSchema, type PlayerDocument } from "./server.model";
import type { PlayerRepository } from "./server.types";

type PlayerRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  wallet_address: string | null;
  email: string | null;
  password_hash: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Map a database row to the player document shape. */
function toDoc(r: PlayerRow): PlayerDocument {
  return PlayerDocumentSchema.parse({
    id: r.id,
    username: r.username ?? `player_${r.id.replace(/-/g, "").slice(0, 8)}`,
    displayName: r.display_name ?? r.username ?? "Player",
    walletAddress: r.wallet_address ?? null,
    email: r.email ?? null,
    passwordHash: r.password_hash ?? null,
    isEmailVerified: false,
    avatarUrl: null,
    lastLoginAt: r.last_login_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findOne(column: string, value: string): Promise<PlayerDocument | null> {
  const { data } = await (await db()).from("players").select("*").eq(column, value).maybeSingle();
  return data ? toDoc(data as PlayerRow) : null;
}

/** Players repository backed by the cloud database. */
export const playerRepository: PlayerRepository = {
  async findById(id) {
    return findOne("id", id);
  },
  async findByEmail(email) {
    return findOne("email", email.toLowerCase());
  },
  async findByWallet(address) {
    return findOne("wallet_address", address);
  },
  async findByUsername(username) {
    const { data } = await (await db())
      .from("players")
      .select("*")
      .ilike("username", username)
      .maybeSingle();
    return data ? toDoc(data as PlayerRow) : null;
  },
  async create(data) {
    const { data: row, error } = await (await db())
      .from("players")
      .insert({
        username: data.username,
        display_name: data.displayName ?? data.username,
        wallet_address: data.walletAddress,
        email: data.email?.toLowerCase() ?? null,
        password_hash: data.passwordHash,
        is_test: false,
        token_hash: "",
        seed: rollSeed(),
        heroes: starterHeroes() as never,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not create player");
    return toDoc(row as PlayerRow);
  },
  async linkEmailAndPassword(id, email, passwordHash) {
    const e = email.toLowerCase();
    const owner = await this.findByEmail(e);
    if (owner && owner.id !== id) throw new Error("Email already registered");
    const { data, error } = await (await db())
      .from("players")
      .update({ email: e, password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Player not found");
    return toDoc(data as PlayerRow);
  },
  async touchLogin(id) {
    const { data, error } = await (await db())
      .from("players")
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Player not found");
    return toDoc(data as PlayerRow);
  },
};

/** Store the hash of a fresh game-session token for a player. */
export async function setSessionToken(id: string, tokenHash: string): Promise<void> {
  await (await db()).from("players").update({ token_hash: tokenHash }).eq("id", id);
}

/** Strip private fields before returning to clients. */
export function toPlayer({ passwordHash: _p, ...player }: PlayerDocument) {
  return player;
}

/** Derive a unique username (3–32 chars) from a seed. */
export async function uniqueUsername(seed: string) {
  const base = (seed.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "player").padEnd(3, "0");
  let name = base;
  while (await playerRepository.findByUsername(name)) name = `${base}${Math.floor(Math.random() * 1e6)}`;
  return name;
}
