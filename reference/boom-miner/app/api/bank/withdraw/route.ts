import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { enqueueWithdrawal } from "@/lib/modules/transactions-pending/repository.server";
import { findPlayerByWallet } from "@/lib/modules/players/repository.server";

/**
 * POST /api/bank/withdraw
 *
 * Body: { amount: number }
 *
 * Enqueue-only: validates the request cheaply, then drops a row on the durable
 * `transactions_pending` queue. The Solana settlement worker drains the queue,
 * sends tokens on-chain, debits coins, and records the ledger row. The client
 * then polls GET /api/transactions to watch the settled row appear.
 *
 * Settlement is asynchronous — the recipient is always the authenticated
 * wallet, so a client can never redirect a payout elsewhere.
 *
 * Withdrawals can be disabled at the server level by setting
 * NEXT_PUBLIC_WALLET_ENABLED=false (or leaving it unset, which defaults to
 * false). Set it to "true" to open withdrawals.
 */
export async function POST(req: Request): Promise<Response> {
  // Server-side gate: NEXT_PUBLIC_WALLET_ENABLED must be exactly "true".
  // Defaults to disabled when the variable is absent or any other value.
  if (process.env.NEXT_PUBLIC_WALLET_ENABLED !== "true") {
    return apiError(
      "Withdrawals are currently disabled",
      "WITHDRAWALS_DISABLED",
      503,
    );
  }

  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", "INVALID_JSON", 400);
  }

  const { amount } = (body ?? {}) as Record<string, unknown>;

  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
    return apiError("Amount must be an integer >= 1", "INVALID_AMOUNT", 400);
  }

  // Cheap pre-check so obviously-broke requests fail fast (authoritative
  // balance + rule checks still run again at settlement time in withdrawCoins).
  const player = await findPlayerByWallet(wallet);
  if (!player) {
    return apiError("Player not found", "NOT_FOUND", 404);
  }
  const coins = (player as { coins?: number }).coins ?? 0;
  if (coins < amount) {
    return apiError("Insufficient coin balance", "INSUFFICIENT_COINS", 422);
  }

  const { jobId } = await enqueueWithdrawal({
    walletAddress: wallet,
    withdrawAmount: amount,
  });

  return apiOk({ status: "queued", jobId }, 202);
}
