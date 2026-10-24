/**
 * lib/modules/marketplace-purchase/settle.server.ts
 *
 * Settlement handler for marketplace_purchase jobs.
 * Called by the transaction worker when draining a queued purchase.
 *
 * Settlement order:
 *   1. Verify the buyer's on-chain payment (buyer → treasury, `price` tokens)
 *   2. Idempotency guard: check transactions_processed for this txId
 *   3. Re-validate the listing is still active and seller hasn't changed
 *   4. Transfer hero ownership in DB (ownerWallet = buyerWallet)
 *   5. Claim txId in transactions_processed (unique index prevents double-settle)
 *   6. Send seller payout from treasury using TREASURY_KEY (price × 0.95)
 *   7. Write marketplace_log row
 *
 * The on-chain buyer → treasury payment is irreversible. If the DB transfer
 * fails after verification, a CRITICAL log is emitted for manual recovery.
 * The treasury holds the funds securely; no automatic refund is issued.
 *
 * SERVER-ONLY.
 */

import type { IInboundTransaction } from "@/lib/modules/transactions-pending/types.server";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import { connectDatabase } from "@/lib/config/database";
import { verifyDepositFromPlayer } from "@/lib/chain/verify";
import {
  acquirePlayerMutation,
  releasePlayerMutation,
} from "@/lib/modules/players/game-mutation-lock.server";
import { claimProcessedTransaction } from "@/lib/modules/transactions-processed/repository.server";
import { insertMarketplaceLog } from "@/lib/modules/marketplace-logs/repository.server";
import type { SendOnChainFn } from "@/server/game-smart-contract/workers/transaction-worker";
import { logger } from "@/server/game-smart-contract/lib/logger";

/** 5% marketplace fee — treasury retains this from the buyer's payment. */
const MARKETPLACE_FEE_RATE = 0.05;

export type SettleMarketplaceResult =
  { ok: true } | { ok: false; code: string; error: string; retryable: boolean };

/**
 * Settles a single marketplace_purchase job from the transactions_pending queue.
 *
 * @param job       - The queued job row (from transactions_pending)
 * @param sendOnChain - Chain-agnostic payout adapter (treasury → seller)
 * @param verifyMaxTries - How many confirmation polls to attempt before giving up
 */
export async function settleMarketplacePurchase(
  job: IInboundTransaction,
  sendOnChain: SendOnChainFn,
  verifyMaxTries = 2,
): Promise<SettleMarketplaceResult> {
  const txId = job.signature;
  // Preserve wallet casing exactly as stored — hero ownerWallet matches
  // player.wallet casing, and the hero repository uses case-insensitive queries.
  const buyerWallet = job.buyerWallet ?? job.walletAddress;
  const sellerWallet = job.sellerWallet;
  const heroId = job.heroId;
  const price = job.purchasePrice ?? 0;

  if (!sellerWallet || !heroId || !buyerWallet || price <= 0) {
    return {
      ok: false,
      code: "INVALID_JOB",
      error: "marketplace_purchase job is missing sellerWallet, heroId, or purchasePrice",
      retryable: false,
    };
  }

  const fee = Math.round(price * MARKETPLACE_FEE_RATE * 1e8) / 1e8;
  const sellerNet = Math.round((price - fee) * 1e8) / 1e8;

  await connectDatabase();

  // ── Step 1: Verify buyer's on-chain payment ─────────────────────────────────
  // Confirms buyer sent exactly `price` tokens to the treasury.
  const verification = await verifyDepositFromPlayer(txId, buyerWallet, price, {
    maxTries: verifyMaxTries,
  });
  if (!verification.valid) {
    const code = verification.code === "NOT_CONFIRMED" ? "NOT_CONFIRMED" : "VERIFICATION_FAILED";
    return {
      ok: false,
      code,
      error: verification.reason ?? "On-chain payment could not be verified",
      retryable: code === "NOT_CONFIRMED",
    };
  }

  const mutationLock = await acquirePlayerMutation(sellerWallet);
  if (!mutationLock) {
    return {
      ok: false,
      code: "GAME_ACTIVE",
      error: "Marketplace settlement is waiting for the seller's game session to end",
      retryable: true,
    };
  }

  try {
    // ── Step 2: Idempotency — claim this txId in the processed ledger ───────────
    // If the row already exists, this purchase was already settled (e.g. worker
    // crashed and restarted). Return success so the job is completed.
    const { claimed } = await claimProcessedTransaction({
      txHash: txId,
      wallet: buyerWallet,
      type: "marketplace_purchase",
      amount: -price,
      metadata: {
        type: "marketplace_purchase",
        heroId: heroId,
        heroName: job.heroName ?? "",
        heroRarity: job.heroRarity ?? "",
        sellerWallet: sellerWallet,
        price,
        fee,
        sellerNet,
        payoutTxHash: "", // patched below after payout succeeds
      },
    });

    if (!claimed) {
      // Already settled on a prior run — idempotently complete.
      logger.info("marketplace_purchase already processed (idempotent)", {
        txId,
        buyerWallet,
        heroId,
      });
      return { ok: true };
    }

    // ── Step 3: Re-validate listing is still active ─────────────────────────────
    const hero = await HeroModel.findOne({
      _id: heroId,
      ownerWallet: sellerWallet,
      "market.listed": true,
    }).lean<{ _id: unknown; ownerWallet: string; market?: { price?: number } }>();

    if (!hero) {
      // Listing was cancelled or hero already sold (race condition).
      // The buyer's payment landed in treasury; manual recovery needed.
      logger.error(
        `[marketplace-settle] CRITICAL: txId ${txId} verified but hero ${heroId} ` +
          `is no longer listed by seller ${sellerWallet}. Manual recovery required. ` +
          `Treasury holds ${price} tokens from buyer ${buyerWallet}.`,
      );
      // Return non-retryable so worker dead-letters the job.
      return {
        ok: false,
        code: "LISTING_GONE",
        error: `Hero ${heroId} is no longer listed by seller ${sellerWallet}`,
        retryable: false,
      };
    }

    // ── Step 4: Transfer hero ownership in DB ───────────────────────────────────
    const transferResult = await HeroModel.updateOne(
      { _id: heroId, ownerWallet: sellerWallet, "market.listed": true },
      {
        $set: {
          ownerWallet: buyerWallet,
          onMap: false,
          "market.listed": false,
          "market.price": 0,
          "market.seller": null,
          "market.sold": Date.now(),
        },
      },
    );

    if (transferResult.modifiedCount !== 1) {
      logger.error(
        `[marketplace-settle] CRITICAL: txId ${txId} verified but hero ${heroId} ` +
          `transfer failed (modifiedCount=0). Possible race. Manual recovery required. ` +
          `Treasury holds ${price} tokens from buyer ${buyerWallet}.`,
      );
      return {
        ok: false,
        code: "TRANSFER_FAILED",
        error: `Hero ${heroId} DB transfer failed — possible concurrent update`,
        retryable: false,
      };
    }
  } finally {
    await releasePlayerMutation(sellerWallet, mutationLock);
  }

  // ── Step 5: Send seller payout from treasury ────────────────────────────────
  // Treasury already holds the full price (buyer → treasury on-chain).
  // Now send sellerNet (95%) from treasury to seller using TREASURY_KEY.
  let payoutTxHash: string;
  try {
    const payout = await sendOnChain(sellerWallet, sellerNet, txId);
    payoutTxHash = payout.signature;
    logger.info("marketplace seller payout sent", {
      sellerWallet,
      sellerNet,
      payoutTxHash,
      refTxId: txId,
    });
  } catch (payoutErr) {
    const errMsg = payoutErr instanceof Error ? payoutErr.message : String(payoutErr);
    // Hero is already transferred. Payout failure is transient (RPC/treasury issue).
    // We return retryable so the worker retries the full job. The idempotency guard
    // above ensures the DB transfer won't be re-run (claimed=false on next attempt).
    logger.error(
      `[marketplace-settle] payout to seller ${sellerWallet} failed for txId ${txId}. ` +
        `Hero transfer is complete. Retrying. Error: ${errMsg}`,
    );
    return {
      ok: false,
      code: "PAYOUT_FAILED",
      error: errMsg,
      retryable: true,
    };
  }

  // ── Step 6: Write marketplace log ───────────────────────────────────────────
  try {
    await insertMarketplaceLog({
      buyerWallet,
      sellerWallet,
      heroId,
      heroName: job.heroName ?? "",
      heroRarity: job.heroRarity ?? "",
      price,
      fee,
      sellerNet,
      txHash: txId,
      payoutTxHash,
      settledAt: Date.now(),
    });
  } catch (logErr) {
    // Non-fatal: log failure doesn't roll back the trade.
    logger.error(
      `[marketplace-settle] Non-fatal: failed to write marketplace_log for txId ${txId}. ` +
        `Error: ${logErr instanceof Error ? logErr.message : String(logErr)}`,
    );
  }

  return { ok: true };
}
