import { createServerFn } from "@tanstack/react-start";
import type { PlayerSession, SyncResult } from "./types";
import { validateClaims } from "./validate";
import { loadPlayer, newSeed, toSession, type PlayerRow } from "./player.server";

const sessionInput = (input: { playerId?: string; token?: string }) => {
  if (typeof input?.playerId !== "string" || typeof input?.token !== "string")
    throw new Error("Invalid input");
  return { playerId: input.playerId, token: input.token };
};

/**
 * Loads the signed-in player's saved game: coins, stage, map seed, cleared
 * blocks and roster. The token proves this browser owns the player.
 */
export const loadGameSession = createServerFn({ method: "POST" })
  .inputValidator(sessionInput)
  .handler(async ({ data }): Promise<PlayerSession> => {
    const row = await loadPlayer(data.playerId, data.token);
    if (!row) throw new Error("Invalid session — sign in again");
    return toSession(row);
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
