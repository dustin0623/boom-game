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
 * chest's rarity and adds it to the roster. The roster write is guarded on
 * updated_at so two opens can never consume one chest twice.
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

    const { data: owned } = await supabaseAdmin
      .from("player_inventory")
      .select("id, quantity")
      .eq("player_id", row.id)
      .eq("item_id", item.id)
      .maybeSingle();
    if (!owned || owned.quantity < 1) throw new Error("You don't own this chest");

    const remaining = owned.quantity - 1;
    const { data: consumed } = await supabaseAdmin
      .from("player_inventory")
      .update({ quantity: remaining, updated_at: new Date().toISOString() })
      .eq("id", owned.id)
      .gt("quantity", 0)
      .select("id")
      .maybeSingle();
    if (!consumed) throw new Error("You don't own this chest");

    const attrs = rollHeroAttributes(item.heroRarity);
    const heroes = row.heroes as SessionHero[];
    const hero: SessionHero = {
      id: `hero-${crypto.randomUUID()}`,
      name: `Bomber #${heroes.length + 1}`,
      type: pickHeroType(),
      rarity: item.heroRarity,
      power: attrs.power,
      speed: attrs.speed,
      stamina: attrs.stamina,
      bombNumber: attrs.bombNum,
      bombRange: attrs.bombRange,
      maxEnergy: attrs.energy,
    };

    const { data: saved } = await supabaseAdmin
      .from("players")
      .update({ heroes: [...heroes, hero] as never, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (!saved) {
      // Roster changed under us — refund the chest and ask the player to retry.
      await supabaseAdmin
        .from("player_inventory")
        .update({ quantity: owned.quantity, updated_at: new Date().toISOString() })
        .eq("id", owned.id);
      throw new Error("Something changed while opening — try again");
    }

    return { hero, remaining };
  });
