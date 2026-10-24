import { createServerFn } from "@tanstack/react-start";
import { loadHeroes, requirePlayer } from "@/lib/game/session/player.server";
import type { SessionHero } from "@/lib/game/session/types";
import { mintCost, rollHero, validMintCount } from "./mint";

const sessionInput = (input: { playerId?: string; token?: string }) => {
  if (typeof input?.playerId !== "string" || typeof input?.token !== "string")
    throw new Error("Invalid input");
  return { playerId: input.playerId, token: input.token };
};

export interface HeroesSnapshot {
  heroes: SessionHero[];
  coins: number;
}

/** Lists the player's heroes and coin balance. */
export const listHeroes = createServerFn({ method: "POST" })
  .inputValidator(sessionInput)
  .handler(async ({ data }): Promise<HeroesSnapshot> => {
    const row = await requirePlayer(data.playerId, data.token);
    const heroes = await loadHeroes(row.id);
    return { heroes, coins: Number(row.coins) };
  });

/**
 * Mints heroes paid with in-game coins (deposits credit coins). Rarity is
 * rolled on the server; the debit, numbering and roster insert happen in one
 * atomic database call so coins can never be spent without heroes.
 */
export const mintHeroes = createServerFn({ method: "POST" })
  .inputValidator((input: { playerId?: string; token?: string; count?: number }) => {
    if (typeof input?.playerId !== "string" || typeof input?.token !== "string") throw new Error("Invalid input");
    if (!validMintCount(input.count)) throw new Error("Choose between 1 and 10 heroes");
    return { playerId: input.playerId, token: input.token, count: input.count };
  })
  .handler(async ({ data }): Promise<{ coins: number; heroes: SessionHero[] }> => {
    const row = await requirePlayer(data.playerId, data.token);
    const heroes = Array.from({ length: data.count }, () => rollHero());
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("mint_heroes", {
      p_player_id: row.id,
      p_cost: mintCost(data.count),
      p_heroes: heroes,
    });
    if (error) {
      if (error.message.includes("not_enough_coins")) throw new Error("Not enough coins");
      throw new Error("Mint failed — try again");
    }
    const r = result as unknown as { coins: number; heroes: SessionHero[] };
    return { coins: Number(r.coins), heroes: r.heroes };
  });

export interface HeroStateInput {
  id: string;
  energy: number;
  onMap: boolean;
  recoveryAt: number;
}

/** Persists live hero energy / deploy state so it survives refresh and device changes. */
export const saveHeroesState = createServerFn({ method: "POST" })
  .inputValidator((input: { playerId?: string; token?: string; heroes?: unknown }) => {
    const base = sessionInput(input);
    const heroes: HeroStateInput[] = Array.isArray(input.heroes)
      ? input.heroes
          .filter(
            (h): h is HeroStateInput =>
              !!h &&
              typeof h === "object" &&
              typeof (h as HeroStateInput).id === "string" &&
              typeof (h as HeroStateInput).energy === "number" &&
              typeof (h as HeroStateInput).onMap === "boolean" &&
              typeof (h as HeroStateInput).recoveryAt === "number",
          )
          .slice(0, 200)
          .map((h) => ({
            id: h.id,
            energy: Math.max(0, Math.round(h.energy)),
            onMap: h.onMap,
            recoveryAt: Math.round(h.recoveryAt),
          }))
      : [];
    return { ...base, heroes };
  })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const row = await requirePlayer(data.playerId, data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("save_heroes_state", {
      p_player_id: row.id,
      p_heroes: data.heroes,
    });
    if (error) throw new Error("Could not save hero state");
    return { ok: true };
  });
