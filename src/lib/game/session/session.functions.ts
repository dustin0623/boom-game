import { createServerFn } from "@tanstack/react-start";
import type { PlayerSession, SyncResult } from "./types";
import { validateClaims } from "./validate";
import { loadHeroes, loadPlayer, loadStageMap, newSeed, toSession, type PlayerRow, type StageMapRow } from "./player.server";

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
    const [map, heroes] = await Promise.all([loadStageMap(row.id), loadHeroes(row.id)]);
    return toSession(row, map, heroes);
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
    const map = await loadStageMap(row.id);
    const current = (r: PlayerRow, m: StageMapRow, accepted = 0, rejected = 0): SyncResult => ({
      ok: true,
      coins: Number(r.coins),
      stage: m.stage,
      seed: Number(m.seed),
      destroyedNodes: m.destroyed_nodes,
      accepted,
      rejected,
    });
    // Claims for an old map are ignored; the client resyncs to the current one.
    if (Number(map.seed) !== data.seed || !data.keys.length) return current(row, map, 0, data.keys.length);

    const outcome = validateClaims({
      stage: map.stage,
      seed: Number(map.seed),
      destroyed: map.destroyed_nodes,
      claimed: data.keys,
      elapsedMs: Date.now() - new Date(map.last_sync_at).getTime(),
    });
    if (!outcome.accepted) return current(row, map, 0, outcome.rejected);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // One atomic DB call: credits only keys not already saved, so retries and
    // overlapping saves can never double-pay or lose progress.
    const { data: saved, error } = await supabaseAdmin.rpc("save_progress", {
      p_player_id: row.id,
      p_seed: Number(map.seed),
      p_rewards: outcome.rewards,
      p_total_chests: 0,
      p_new_seed: outcome.cleared ? newSeed() : 0,
    });
    if (error || !saved) throw new Error("Save failed");
    const s = saved as unknown as { coins: number; stage: number; seed: number; destroyed: string[]; accepted: number };
    return {
      ok: true,
      coins: Number(s.coins),
      stage: s.stage,
      seed: Number(s.seed),
      destroyedNodes: s.destroyed,
      accepted: s.accepted,
      rejected: outcome.rejected,
    };
  });
