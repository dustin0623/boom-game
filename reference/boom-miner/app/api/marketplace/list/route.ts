/**
 * POST /api/marketplace/list
 *
 * Lists an owned hero for sale on the marketplace.
 *
 * Body: { heroId: string; price: number }
 *
 * Validates:
 *   - Caller is authenticated
 *   - Hero exists and belongs to caller
 *   - Hero is not currently on the map
 *   - Hero is not already listed
 *   - Price is a positive number
 *
 * On success: sets market.listed=true, market.price, market.seller,
 * market.created on the hero document and returns the updated hero.
 *
 * Response: 200 { hero }
 *
 * SERVER-ONLY.
 */

import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { connectDatabase } from "@/lib/config/database";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import {
  acquirePlayerMutation,
  releasePlayerMutation,
} from "@/lib/modules/players/game-mutation-lock.server";
import type { IHero } from "@/lib/modules/heroes/types.server";

/** Case-insensitive regex for ownerWallet — matches any EIP-55 casing. */
function walletRegex(wallet: string) {
  return { $regex: new RegExp(`^${wallet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED !== "true") {
    return apiError("Marketplace is currently disabled", "MARKETPLACE_DISABLED", 503);
  }

  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  let body: { heroId?: string; price?: number };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "BAD_REQUEST", 400);
  }

  const { heroId, price } = body;
  if (!heroId) return apiError("heroId is required", "BAD_REQUEST", 400);
  if (!price || price <= 0) return apiError("price must be a positive number", "BAD_REQUEST", 400);

  await connectDatabase();
  const mutationLock = await acquirePlayerMutation(wallet);
  if (!mutationLock)
    return apiError("Disconnect from the game before changing listings", "GAME_ACTIVE", 409);
  try {
    const hero = await HeroModel.findOne({
      _id: heroId,
      ownerWallet: walletRegex(wallet),
    }).lean<IHero>();
    if (!hero) return apiError("Hero not found", "HERO_NOT_FOUND", 404);
    if (hero.onMap)
      return apiError("Recall the hero from the map before listing", "HERO_ON_MAP", 409);
    if (hero.market?.listed) {
      return apiError("Hero is already listed for sale", "ALREADY_LISTED", 409);
    }

    const updated = (await HeroModel.findOneAndUpdate(
      { _id: heroId, ownerWallet: walletRegex(wallet) },
      {
        $set: {
          "market.listed": true,
          "market.price": price,
          "market.seller": wallet,
          "market.created": Date.now(),
        },
      },
      { new: true, lean: true },
    )) as IHero | null;

    if (!updated) return apiError("Failed to list hero", "UPDATE_FAILED", 500);

    return apiOk({ hero: updated });
  } finally {
    await releasePlayerMutation(wallet, mutationLock);
  }
}

/**
 * DELETE /api/marketplace/list
 *
 * Cancels an active listing, returning the hero to the player's roster.
 *
 * Body: { heroId: string }
 *
 * SERVER-ONLY.
 */
export async function DELETE(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED !== "true") {
    return apiError("Marketplace is currently disabled", "MARKETPLACE_DISABLED", 503);
  }

  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  let body: { heroId?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "BAD_REQUEST", 400);
  }

  const { heroId } = body;
  if (!heroId) return apiError("heroId is required", "BAD_REQUEST", 400);

  await connectDatabase();
  const mutationLock = await acquirePlayerMutation(wallet);
  if (!mutationLock)
    return apiError("Disconnect from the game before changing listings", "GAME_ACTIVE", 409);
  try {
    const result = await HeroModel.findOneAndUpdate(
      { _id: heroId, ownerWallet: walletRegex(wallet), "market.listed": true },
      {
        $set: {
          "market.listed": false,
          "market.price": 0,
          "market.seller": null,
          "market.created": 0,
        },
      },
      { new: true, lean: true },
    );

    if (!result) return apiError("Listing not found or already removed", "NOT_FOUND", 404);

    return apiOk({ heroId });
  } finally {
    await releasePlayerMutation(wallet, mutationLock);
  }
}
