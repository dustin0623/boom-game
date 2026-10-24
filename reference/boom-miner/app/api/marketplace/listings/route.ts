/**
 * GET /api/marketplace/listings
 *
 * Returns all heroes currently listed for sale (market.listed === true).
 *
 * Query params:
 *   rarity  — filter by rarity (common | uncommon | rare | epic | legendary)
 *   sort    — "price-asc" | "price-desc" | "recent" (default)
 *   search  — partial name match (case-insensitive)
 *   limit   — page size, default 48, max 100
 *   cursor  — keyset cursor: market.created value of the last item seen
 *             (only used when sort=recent)
 *
 * Also returns aggregate stats: total listed count, caller's listed count,
 * and the 5 top-priced listings for the "Top Sales" strip.
 *
 * Auth is optional — if the caller is authenticated their wallet is used to
 * compute `myListingsCount`; otherwise myListingsCount is 0.
 *
 * SERVER-ONLY.
 */

import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { connectDatabase } from "@/lib/config/database";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import type { IHero } from "@/lib/modules/heroes/types.server";

/** Case-insensitive regex for ownerWallet — matches any EIP-55 casing. */
function walletRegex(wallet: string) {
  return { $regex: new RegExp(`^${wallet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 48;

export async function GET(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED !== "true") {
    return apiError("Marketplace is currently disabled", "MARKETPLACE_DISABLED", 503);
  }

  // Auth is optional for browsing listings
  const wallet = await getWallet(req).catch(() => null);

  const url    = new URL(req.url);
  const rarity = url.searchParams.get("rarity") ?? "";
  const sort   = url.searchParams.get("sort") ?? "recent";
  const search = url.searchParams.get("search") ?? "";
  const mine   = url.searchParams.get("mine") === "true";
  const limit  = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const cursor = url.searchParams.get("cursor");

  await connectDatabase();

  // Base filter: all listed heroes
  const baseFilter: Record<string, unknown> = { "market.listed": true };
  if (rarity)           baseFilter.rarity = rarity;
  if (search)           baseFilter.name   = { $regex: search, $options: "i" };
  if (mine && wallet)   baseFilter.ownerWallet = walletRegex(wallet);

  // Keyset cursor for "recent" sort (created desc)
  if (cursor && sort === "recent") {
    baseFilter["market.created"] = { $lt: parseInt(cursor, 10) };
  }

  // Determine sort order
  let sortSpec: Record<string, 1 | -1>;
  switch (sort) {
    case "price-asc":  sortSpec = { "market.price": 1 };  break;
    case "price-desc": sortSpec = { "market.price": -1 }; break;
    default:           sortSpec = { "market.created": -1 }; break;
  }

  // Page of listings
  const listings = await HeroModel.find(baseFilter)
    .sort(sortSpec)
    .limit(limit)
    .lean<IHero[]>();

  // Aggregate stats (run in parallel)
  const [totalCount, myCount, topSales] = await Promise.all([
    HeroModel.countDocuments({ "market.listed": true }),
    wallet
      ? HeroModel.countDocuments({ "market.listed": true, ownerWallet: walletRegex(wallet) })
      : Promise.resolve(0),
    HeroModel.find({ "market.listed": true })
      .sort({ "market.price": -1 })
      .limit(5)
      .lean<IHero[]>(),
  ]);

  // Serialise Mongoose lean docs to plain JSON-safe objects
  const serialise = (doc: IHero) => ({
    id:            String((doc as unknown as { _id: unknown })._id),
    minted_number: doc.minted_number,
    name:          doc.name,
    type:          doc.type,
    rarity:        doc.rarity,
    attributes:    doc.attributes,
    currentEnergy: doc.currentEnergy,
    maxEnergy:     doc.maxEnergy,
    market: {
      listed:  doc.market?.listed  ?? false,
      price:   doc.market?.price   ?? 0,
      seller:  doc.market?.seller  ?? null,
      created: doc.market?.created ?? 0,
      sold:    doc.market?.sold    ?? 0,
    },
  });

  return apiOk({
    listings:       listings.map(serialise),
    topSales:       topSales.map(serialise),
    totalCount,
    myListingsCount: myCount,
    hasMore:        listings.length === limit,
    nextCursor:
      sort === "recent" && listings.length > 0
        ? String(listings.at(-1)?.market?.created ?? 0)
        : null,
  });
}
