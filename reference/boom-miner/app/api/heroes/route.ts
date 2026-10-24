import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { ensureStarterHero, getHeroesByIds } from "@/lib/modules/heroes/repository.server";

/**
 * GET /api/heroes
 *
 * Returns the authenticated player's hero roster.
 * Auto-creates the starter Common hero if the roster is empty.
 *
 * Query params:
 *   ids=id1,id2,...  — fetch specific heroes by _id (used by the shop to load
 *                      freshly minted heroes immediately after settlement).
 */
export async function GET(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const heroes = await getHeroesByIds(ids);
    return apiOk({ heroes });
  }

  const heroes = await ensureStarterHero(wallet);
  return apiOk({ heroes });
}
