import { createServerFn } from "@tanstack/react-start";
import { requirePlayer } from "@/lib/game/session/player.server";
import { SHOP_ITEM_BY_ID } from "./items";

const purchaseInput = (input: { playerId?: string; token?: string; itemId?: string }) => {
  if (typeof input?.playerId !== "string" || typeof input?.token !== "string")
    throw new Error("Invalid input");
  if (typeof input.itemId !== "string" || !SHOP_ITEM_BY_ID[input.itemId])
    throw new Error("Unknown item");
  return { playerId: input.playerId, token: input.token, itemId: input.itemId };
};

/**
 * Buys a shop item with mined coins. The debit and the inventory credit happen
 * in one atomic database transaction (buy_chest), so a failure can never leave
 * coins spent without the item.
 */
export const purchaseItem = createServerFn({ method: "POST" })
  .inputValidator(purchaseInput)
  .handler(async ({ data }): Promise<{ coins: number; itemId: string; quantity: number }> => {
    const item = SHOP_ITEM_BY_ID[data.itemId]!;
    const row = await requirePlayer(data.playerId, data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("buy_chest", {
      p_player_id: row.id,
      p_item_id: item.id,
      p_price: item.price,
    });
    if (error) {
      if (error.message.includes("not_enough_coins")) throw new Error("Not enough coins");
      throw new Error("Purchase failed — try again");
    }
    const { coins, quantity } = result as { coins: number; quantity: number };
    return { coins: Number(coins), itemId: item.id, quantity: Number(quantity) };
  });
