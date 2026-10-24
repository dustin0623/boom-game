import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { getNextMintedNumber } from "@/lib/modules/heroes/repository.server";

/**
 * GET /api/heroes/next-number
 *
 * Returns the next safe sequential minted_number by querying the global max
 * across all heroes in the DB. The client must call this immediately before
 * building the mint transaction to avoid duplicate-key conflicts.
 */
export async function GET(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const nextNumber = await getNextMintedNumber();
  return apiOk({ nextNumber });
}
