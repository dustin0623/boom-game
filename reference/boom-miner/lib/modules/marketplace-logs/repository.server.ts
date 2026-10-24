/**
 * lib/modules/marketplace-logs/repository.server.ts
 *
 * Data-access surface for the marketplace_logs collection.
 * Written by the settlement worker after a purchase completes.
 * Read by GET /api/marketplace/logs for buyer history.
 */

import { MarketplaceLogModel } from "./model.server";
import type { IMarketplaceLog, IMarketplaceLogData } from "./types.server";
import { connectDatabase } from "@/lib/config/database";

export type { IMarketplaceLog, IMarketplaceLogData } from "./types.server";

/**
 * Inserts an immutable marketplace log row.
 * Called once per completed purchase inside the settle worker.
 */
export async function insertMarketplaceLog(
  input: IMarketplaceLogData,
): Promise<IMarketplaceLog> {
  await connectDatabase();
  return MarketplaceLogModel.create(input);
}

/**
 * Returns a page of purchase logs for `wallet` (as buyer), newest-first.
 * Supports keyset pagination via `cursor` (settledAt of the last item seen).
 */
export async function getMarketplaceLogs(
  wallet: string,
  limit = 20,
  cursor?: number,
): Promise<IMarketplaceLog[]> {
  await connectDatabase();
  const filter: Record<string, unknown> = { buyerWallet: wallet };
  if (cursor !== undefined) filter.settledAt = { $lt: cursor };
  return MarketplaceLogModel.find(filter)
    .sort({ settledAt: -1 })
    .limit(limit)
    .lean<IMarketplaceLog[]>();
}
