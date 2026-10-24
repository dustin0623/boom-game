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
 * Buys a shop item with mined coins. The coin debit is guarded on the current
 * balance so a double-click or replay can never spend coins twice.
 */
export const purchaseItem = createServerFn({ method: "POST" })
  .inputValidator(purchaseInput)
  .handler(async ({ data }): Promise<{ coins: number; itemId: string; quantity: number }> => {
    const item = SHOP_ITEM_BY_ID[data.itemId]!;
    const row = await requirePlayer(data.playerId, data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: debited } = await supabaseAdmin
      .from("players")
      .update({ coins: Number(row.coins) - item.price, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .gte("coins", item.price)
      .select("coins")
      .maybeSingle();
    if (!debited) throw new Error("Not enough coins");

    const { data: existing } = await supabaseAdmin
      .from("player_inventory")
      .select("id, quantity")
      .eq("player_id", row.id)
      .eq("item_id", item.id)
      .maybeSingle();

    let quantity = 1;
    if (existing) {
      quantity = existing.quantity + 1;
      await supabaseAdmin
        .from("player_inventory")
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("player_inventory")
        .insert({ player_id: row.id, item_id: item.id, quantity: 1 });
    }

    return { coins: Number(debited.coins), itemId: item.id, quantity };
  });
