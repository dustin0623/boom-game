import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { enqueueMint } from "@/lib/modules/transactions-pending/repository.server";
import { heroMint } from "@/features/events/hero-mint/action";

/**
 * POST /api/heroes/mint
 *
 * Body: { txId: string, count: number, minted_numbers: number[] }
 *
 * Enqueue-only: the player signs a token transfer to the treasury in the
 * browser and sends us the resulting signature (`txId`). We validate the
 * request shape via the pure heroMint event, then drop a `mint` row on the
 * durable `transactions_pending` queue keyed by `txId`.
 *
 * The browser NEVER mints. The Solana smart-contract worker drains the queue,
 * verifies the payment on-chain, atomically claims the txId in the settlement
 * ledger, and inserts the heroes. The client then polls GET /api/transactions
 * to detect the settled mint and pull fresh player state over the socket.
 */
export async function POST(req: Request): Promise<Response> {
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

  const { txId, count = 1, minted_numbers } = (body ?? {}) as Record<string, unknown>;

  if (typeof txId !== "string" || txId.trim().length === 0) {
    return apiError("txId (on-chain signature) is required", "INVALID_TX_ID", 400);
  }

  // Structural validation (count + minted_numbers shape). No coin balance.
  const eventResult = heroMint({
    action: { count: count as number, minted_numbers: minted_numbers as number[] },
  });
  if (!eventResult.ok) {
    return apiError(eventResult.error ?? "Mint rejected", eventResult.code ?? "MINT_REJECTED", 400);
  }

  // Enqueue the mint. `signature = txId` is unique, so the same on-chain payment
  // can never be queued (or minted) twice.
  const { jobId, duplicate } = await enqueueMint({
    walletAddress: wallet,
    txId: txId.trim(),
    count: count as number,
    mintedNumbers: minted_numbers as number[],
  });

  return apiOk({ status: "queued", jobId, duplicate }, 202);
}
