import { createServerFn } from "@tanstack/react-start";
import { requirePlayer } from "@/lib/game/session/player.server";
import type { SessionHero } from "@/lib/game/session/types";
import { mintCost, rollHero, validMintCount } from "./mint";

/**
 * Mints heroes paid with in-game coins (deposits credit coins). Rarity is
 * rolled on the server; the debit, numbering and roster update happen in one
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
    const r = result as { coins: number; heroes: SessionHero[] };
    return { coins: Number(r.coins), heroes: r.heroes };
  });
