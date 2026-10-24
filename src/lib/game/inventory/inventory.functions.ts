import { createServerFn } from "@tanstack/react-start";
import { pickHeroType, rollHeroAttributes } from "@/game/data/HeroRarity";
import { requirePlayer } from "@/lib/game/session/player.server";
import type { SessionHero } from "@/lib/game/session/types";
import { SHOP_ITEM_BY_ID } from "@/lib/game/shop/items";

const sessionInput = (input: { playerId?: string; token?: string }) => {
  if (typeof input?.playerId !== "string" || typeof input?.token !== "string")
    throw new Error("Invalid input");
  return { playerId: input.playerId, token: input.token };
};

export interface InventoryItem {
  itemId: string;
  quantity: number;
}

export interface InventorySnapshot {
  items: InventoryItem[];
  heroes: SessionHero[];
  coins: number;
}

/** Lists the player's unopened chests, roster and coin balance. */
export const listInventory = createServerFn({ method: "POST" })
  .inputValidator(sessionInput)
  .handler(async ({ data }): Promise<InventorySnapshot> => {
    const row = await requirePlayer(data.playerId, data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items } = await supabaseAdmin
      .from("player_inventory")
      .select("item_id, quantity")
      .eq("player_id", row.id)
      .order("created_at", { ascending: true });
    return {
      items: (items ?? []).map((i) => ({ itemId: i.item_id, quantity: i.quantity })),
      heroes: row.heroes as SessionHero[],
      coins: Number(row.coins),
    };
  });

/**
 * Opens a chest from the inventory: consumes one, rolls a bomber of the
 * chest's rarity and adds it to the roster. The consume and the roster append
 * happen in one atomic database transaction (open_chest), so two opens can
 * never consume one chest twice. The bomber's name number is assigned by the
 * database from the roster length.
 */
export const openChest = createServerFn({ method: "POST" })
  .inputValidator((input: { playerId?: string; token?: string; itemId?: string }) => {
    const base = sessionInput(input);
    if (typeof input.itemId !== "string" || !SHOP_ITEM_BY_ID[input.itemId])
      throw new Error("Unknown chest");
    return { ...base, itemId: input.itemId };
  })
  .handler(async ({ data }): Promise<{ hero: SessionHero; remaining: number }> => {
    const item = SHOP_ITEM_BY_ID[data.itemId]!;
    const row = await requirePlayer(data.playerId, data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const attrs = rollHeroAttributes(item.heroRarity);
    const hero: SessionHero = {
      id: `hero-${crypto.randomUUID()}`,
      name: "", // Assigned by open_chest from the current roster length.
      type: pickHeroType(),
      rarity: item.heroRarity,
      power: attrs.power,
      speed: attrs.speed,
      stamina: attrs.stamina,
      bombNumber: attrs.bombNum,
      bombRange: attrs.bombRange,
      maxEnergy: attrs.energy,
    };

    const { data: result, error } = await supabaseAdmin.rpc("open_chest", {
      p_player_id: row.id,
      p_item_id: item.id,
      p_hero: hero as never,
    });
    if (error) {
      if (error.message.includes("chest_not_owned")) throw new Error("You don't own this chest");
      throw new Error("Could not open the chest — try again");
    }
    const { remaining } = result as { remaining: number };

    // Read back the roster name the database assigned.
    const { data: fresh } = await supabaseAdmin
      .from("players")
      .select("heroes")
      .eq("id", row.id)
      .single();
    const saved = (fresh?.heroes as SessionHero[] | null)?.find((h) => h.id === hero.id);
    return { hero: saved ?? hero, remaining: Number(remaining) };
  });
