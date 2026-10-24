import { createServerFn } from "@tanstack/react-start";
import { HeroRarity, HeroType, rollHeroAttributes } from "@/game/data/HeroRarity";
import type { PlayerSession, SessionHero, SyncResult } from "./types";
import { validateClaims } from "./validate";

const newSeed = () => Math.floor(Math.random() * 2147483647);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function starterHeroes(): SessionHero[] {
  const rarities = [HeroRarity.Common, HeroRarity.Uncommon, HeroRarity.Rare, HeroRarity.Epic];
  const types = Object.values(HeroType);
  return rarities.map((rarity, i) => {
    const a = rollHeroAttributes(rarity);
    return {
      id: `hero-${i}`,
      name: `Bomber #${i + 1}`,
      type: types[(i * 3) % types.length]!,
      rarity,
      power: a.power,
      speed: a.speed,
      stamina: a.stamina,
      bombNumber: a.bombNum,
      bombRange: a.bombRange,
      maxEnergy: a.energy,
    };
  });
}

type PlayerRow = {
  id: string;
  coins: number;
  stage: number;
  seed: number;
  destroyed_nodes: string[];
  heroes: unknown;
  token_hash: string;
  last_sync_at: string;
};

const toSession = (r: PlayerRow): PlayerSession => ({
  playerId: r.id,
  coins: Number(r.coins),
  stage: r.stage,
  seed: Number(r.seed),
  destroyedNodes: r.destroyed_nodes,
  heroes: r.heroes as SessionHero[],
});

async function loadPlayer(playerId: string, token: string): Promise<PlayerRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (!data || data.token_hash !== (await sha256(token))) return null;
  return data as PlayerRow;
}

/**
 * Resumes the browser's test player or creates a new one (is_test = true).
 * The token is a random secret only this browser holds; the database stores its hash.
 */
export const startTestSession = createServerFn({ method: "POST" })
  .inputValidator((input: { playerId?: string; token?: string }) => ({
    playerId: typeof input?.playerId === "string" ? input.playerId : undefined,
    token: typeof input?.token === "string" ? input.token : undefined,
  }))
  .handler(async ({ data }): Promise<{ session: PlayerSession; token: string }> => {
    if (data.playerId && data.token && /^[0-9a-f-]{36}$/.test(data.playerId)) {
      const row = await loadPlayer(data.playerId, data.token);
      if (row) return { session: toSession(row), token: data.token };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID() + crypto.randomUUID();
    const { data: row, error } = await supabaseAdmin
      .from("players")
      .insert({
        is_test: true,
        token_hash: await sha256(token),
        seed: newSeed(),
        heroes: starterHeroes() as never,
      })
      .select("*")
      .single();
    if (error || !row) {
      console.error("startTestSession insert failed", error);
      throw new Error("Could not create test player");
    }
    return { session: toSession(row as PlayerRow), token };
  });

/** Credits verified destroyed blocks; advances the stage when the last chest is gone. */
export const syncProgress = createServerFn({ method: "POST" })
  .inputValidator((input: { playerId: string; token: string; seed: number; keys: string[] }) => {
    if (typeof input?.playerId !== "string" || typeof input.token !== "string") throw new Error("Invalid input");
    const keys = Array.isArray(input.keys)
      ? input.keys.filter((k) => typeof k === "string" && /^\d{1,3},\d{1,3}$/.test(k)).slice(0, 400)
      : [];
    return { playerId: input.playerId, token: input.token, seed: Number(input.seed), keys };
  })
  .handler(async ({ data }): Promise<SyncResult> => {
    const row = await loadPlayer(data.playerId, data.token);
    if (!row) throw new Error("Unknown player");
    const current = (r: PlayerRow, accepted = 0, rejected = 0): SyncResult => ({
      ok: true,
      coins: Number(r.coins),
      stage: r.stage,
      seed: Number(r.seed),
      destroyedNodes: r.destroyed_nodes,
      accepted,
      rejected,
    });
    // Claims for an old map are ignored; the client resyncs to the current one.
    if (Number(row.seed) !== data.seed || !data.keys.length) return current(row, 0, data.keys.length);

    const now = Date.now();
    const outcome = validateClaims({
      stage: row.stage,
      seed: Number(row.seed),
      destroyed: row.destroyed_nodes,
      claimed: data.keys,
      elapsedMs: now - new Date(row.last_sync_at).getTime(),
    });
    const update = outcome.cleared
      ? { stage: row.stage + 1, seed: newSeed(), destroyed_nodes: [] as string[] }
      : { destroyed_nodes: outcome.destroyed };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Guarded on last_sync_at so two overlapping syncs can never both credit.
    const { data: saved } = await supabaseAdmin
      .from("players")
      .update({
        ...update,
        coins: Number(row.coins) + outcome.coins,
        last_sync_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", row.id)
      .eq("last_sync_at", row.last_sync_at)
      .select("*")
      .maybeSingle();
    if (!saved) {
      const fresh = await loadPlayer(data.playerId, data.token);
      return { ...current(fresh ?? row), ok: false };
    }
    return current(saved as PlayerRow, outcome.accepted, outcome.rejected);
  });
