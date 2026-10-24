import { findEquipmentsByIds } from "@/lib/modules/equipments/server.repository";
import { equippedIds, resolvedPlayerStats } from "@/features/types/game/stats";
/**
 * GET /api/shop/prices
 *
 * Current shared emission-based HASH prices and fixed HIVE prices.
 * Owned counts are personal to the signed-in player; minerate fields are informational.
 */

import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";
import { findPlayerByWallet } from "@/lib/modules/players/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import {
  GLOBAL_MINERATE_KEY,
  SOCIAL_ECONOMY,
} from "@/lib/config/constants/economy";
import { getPricingEmission } from "@/features/events/backend/shop-pricing/emission.server";
import { toShopPricesDto } from "@/lib/api/dto/shop-prices";
import { findInventoryItemsByWallet } from "@/lib/modules/items/server.repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;

  try {
    const globalMinerate = Math.max(
      SOCIAL_ECONOMY.pricing.globalMinerateFloor,
      (await gameStatsRepository.get(GLOBAL_MINERATE_KEY)) ?? 0,
    );
    const emission = await getPricingEmission();
    const player = await findPlayerByWallet(auth.wallet);
    if (player) player.stats = resolvedPlayerStats(player, await findEquipmentsByIds(equippedIds(player)));
    const stacks = await findInventoryItemsByWallet(auth.wallet);
    const prices = toShopPricesDto(
      globalMinerate,
      emission,
      player,
      Date.now(),
      Object.fromEntries(
        stacks.map(({ itemId, quantity }) => [itemId, quantity]),
      ),
    );
    return jsonResponse({ ok: true, ...prices }, request, {
      status: 200,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[shop/prices]", err);
    return jsonResponse(
      { ok: false, error: "Unable to read shop prices" },
      request,
      { status: 503 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
