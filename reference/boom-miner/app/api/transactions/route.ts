import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { getTransactionHistory } from "@/lib/modules/transactions-processed/repository.server";
import type { ProcessedTransactionType } from "@/lib/modules/transactions-processed/types.server";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 25;
const VALID_TYPES: ProcessedTransactionType[] = ["withdrawal", "mint"];

/**
 * GET /api/transactions?limit=25&cursor=<processedAt>&type=withdrawal|mint
 *
 * Paginated settlement history for the authenticated wallet, newest-first.
 * Uses keyset pagination on `processedAt` — pass the returned `nextCursor`
 * to fetch the next page. Omitting `type` returns both withdrawals and mints.
 * Clients poll this after enqueuing a withdrawal or mint to detect settlement.
 */
export async function GET(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const url = new URL(req.url);

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor != null && Number.isFinite(Number(rawCursor)) ? Number(rawCursor) : undefined;

  const rawType = url.searchParams.get("type");
  const type =
    rawType && VALID_TYPES.includes(rawType as ProcessedTransactionType)
      ? (rawType as ProcessedTransactionType)
      : undefined;

  const { transactions, nextCursor } = await getTransactionHistory(wallet, limit, cursor, type);

  // Serialize to plain objects so metadata (Mixed field) survives JSON.stringify cleanly.
  const serialized = transactions.map((tx) => ({
    txHash:      tx.txHash,
    wallet:      tx.wallet,
    type:        tx.type,
    amount:      tx.amount,
    processedAt: tx.processedAt,
    metadata:    tx.metadata ?? null,
  }));

  return apiOk({ transactions: serialized, nextCursor });
}
