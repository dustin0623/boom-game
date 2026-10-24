/**
 * POST /api/marketplace/purchase
 *
 * Step 2 of the on-chain marketplace purchase flow.
 *
 * The buyer has already:
 *   1. Called POST /api/marketplace/purchase/build-tx to get an unsigned tx
 *   2. Signed and broadcast that transaction (player → treasury token transfer)
 *
 * This route receives the confirmed on-chain txId and enqueues a
 * `marketplace_purchase` job in `transactions_pending`. The worker will:
 *   - Verify the on-chain payment (buyer sent `price` tokens to treasury)
 *   - Transfer hero ownership in the DB (ownerWallet = buyerWallet)
 *   - Send the seller their net payout (price × 0.95) from treasury using TREASURY_KEY
 *   - Write a marketplace_log row
 *   - Complete the job
 *
 * Body: { heroId: string; txId: string }
 *
 * Response: 202 { jobId, heroId, txId, message }
 *           409 if the same txId was already queued (idempotent re-submission)
 *
 * SERVER-ONLY.
 */

import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { connectDatabase } from "@/lib/config/database";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import { enqueueMarketplacePurchase } from "@/lib/modules/transactions-pending/repository.server";

export async function POST(req: Request): Promise<Response> {
  // Server-side gate: NEXT_PUBLIC_MARKETPLACE_ENABLED must be exactly "true".
  // Defaults to disabled when the variable is absent or any other value.
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED !== "true") {
    return apiError(
      "Marketplace is currently disabled",
      "MARKETPLACE_DISABLED",
      503,
    );
  }

  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  let body: { heroId?: string; txId?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "BAD_REQUEST", 400);
  }

  const { heroId, txId } = body;
  if (!heroId) return apiError("heroId is required", "BAD_REQUEST", 400);
  if (!txId)   return apiError("txId is required", "BAD_REQUEST", 400);

  await connectDatabase();

  const hero = await HeroModel.findById(heroId).lean<{
    _id: unknown;
    ownerWallet: string;
    name: string;
    rarity: string;
    market?: { listed?: boolean; price?: number; seller?: string | null };
  }>();

  if (!hero) return apiError("Hero not found", "HERO_NOT_FOUND", 404);
  if (!hero.market?.listed) return apiError("Hero is not listed for sale", "NOT_LISTED", 409);
  if (hero.ownerWallet.toLowerCase() === wallet.toLowerCase()) {
    return apiError("You cannot purchase your own hero", "CANNOT_BUY_OWN", 403);
  }

  const price = hero.market.price ?? 0;
  if (price <= 0) return apiError("Invalid listing price", "INVALID_PRICE", 409);

  const result = await enqueueMarketplacePurchase({
    buyerWallet:  wallet,
    sellerWallet: hero.ownerWallet,
    heroId,
    heroName:     hero.name,
    heroRarity:   hero.rarity,
    price,
    txId,
  });

  if (result.duplicate) {
    return apiError(
      "This transaction has already been submitted",
      "DUPLICATE_TX",
      409,
    );
  }

  return apiOk(
    {
      jobId:   result.jobId,
      heroId,
      txId,
      message: "Purchase queued for settlement",
    },
    202,
  );
}
