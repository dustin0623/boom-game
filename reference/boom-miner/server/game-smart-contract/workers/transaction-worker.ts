/**
 * server/solana-smart-contract/workers/transaction-worker.ts
 *
 * Drains the `transactions_pending` queue and settles BOTH withdrawals and
 * mints on-chain.
 *
 * Guarantees:
 *   - Sequential processing (oldest-first) to avoid concurrent double-spends.
 *   - Idempotent settlement:
 *       withdrawal → withdrawCoins() sends on-chain then debits + writes a
 *         ledger row keyed on the unique txHash.
 *       mint       → verifyAndMintHeroes() verifies the player's on-chain
 *         payment, atomically claims the txId in the ledger, and inserts heroes.
 *   - Retry with dead-lettering: transient failures bump retryCount; after
 *     maxRetries the row is flagged "dead" and skipped.
 *
 * Run exactly ONE instance so the sequential guarantee holds.
 *
 * SERVER-ONLY.
 */

import {
  listPendingOldestFirst,
  completeJob,
  failJob,
  countJobsByStatus,
} from "@/lib/modules/transactions-pending/repository.server";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/types.server";
import { withdrawCoins, WithdrawError } from "@/lib/modules/players/repository.server";
import { verifyAndMintHeroes } from "@/lib/modules/heroes/repository.server";
import { settleMarketplacePurchase } from "@/lib/modules/marketplace-purchase/settle.server";
import { config } from "@/lib/config/config";
import { getHiveNodes } from "@/lib/chain/hive/rpc";
import { logger } from "../lib/logger";

/** Adapter type: send `amount` whole tokens to `playerWallet`; return a signature. */
export type SendOnChainFn = (
  playerWallet: string,
  amount: number,
  ref: string,
) => Promise<{ signature: string }>;

/** Terminal withdrawal business errors — retrying will never help. */
const NON_RETRYABLE = new Set([
  "INVALID_AMOUNT",
  "NOT_FOUND",
  "EXCEEDS_LIMIT",
  "INSUFFICIENT_COINS",
]);

/** Terminal mint failure codes — the payment is confirmed-but-invalid. */
const NON_RETRYABLE_MINT = new Set([
  "INVALID_MINTED_NUMBERS",
  "VERIFICATION_FAILED",
]);

export class TransactionWorker {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = false;

  constructor(
    private readonly sendOnChain: SendOnChainFn,
    private readonly pollMs = config.withdrawal.workerPollMs,
    private readonly maxRetries = config.withdrawal.maxRetries,
  ) {}

  start(): void {
    logger.info(`starting — polling every ${this.pollMs}ms, maxRetries=${this.maxRetries}`);
    // Kick an immediate drain, then schedule.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.pollMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("stopped");
  }

  /** One drain cycle. Guarded so overlapping intervals never run concurrently. */
  private async tick(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      // Refresh the live Hive node list from beacon.peakd.com at the start of
      // every drain cycle. getHiveNodes() caches for 60s so this is cheap and
      // ensures broadcast operations in this batch use the best available nodes.
      if (config.blockchain.chain === "hive") {
        try {
          const nodes = await getHiveNodes();
          logger.info(`beacon nodes resolved (${nodes.length})`, { nodes });
        } catch {
          // Non-fatal: transfer.ts makeHiveClient() will fall back to config nodes.
        }
      }

      const jobs = await listPendingOldestFirst();
      if (jobs.length === 0) return;

      logger.info(`draining ${jobs.length} job(s)`);
      for (const job of jobs) {
        if (this.stopped) break;
        await this.processJob(job);
      }
    } catch (err) {
      logger.error("drain cycle error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.draining = false;
    }
  }

  private async processJob(job: IInboundTransaction): Promise<void> {
    if (job.type === "mint") {
      await this.processMintJob(job);
      return;
    }
    if (job.type === "marketplace_purchase") {
      await this.processMarketplacePurchaseJob(job);
      return;
    }
    await this.processWithdrawalJob(job);
  }

  /** Settles a withdrawal: send on-chain, debit coins, write ledger row. */
  private async processWithdrawalJob(job: IInboundTransaction): Promise<void> {
    const id = String(job._id);
    const amount = job.withdrawAmount ?? 0;
    try {
      const result = await withdrawCoins(
        job.walletAddress,
        amount,
        job.signature,
        this.sendOnChain,
      );
      await completeJob(id);
      logger.info("settled withdrawal", {
        wallet: job.walletAddress,
        amount,
        txHash: result.txHash,
      });
    } catch (err) {
      const code = err instanceof WithdrawError ? err.code : undefined;
      const message = err instanceof Error ? err.message : String(err);

      // Non-retryable business failures: dead-letter immediately.
      if (code && NON_RETRYABLE.has(code)) {
        await failJob(id, `${code}: ${message}`, 1);
        logger.warn("dead-lettered (non-retryable)", {
          wallet: job.walletAddress,
          amount,
          code,
        });
        return;
      }

      // Transient failures (RPC/treasury/network): retry with backoff-by-poll.
      const deadLettered = await failJob(id, `${code ?? "ERROR"}: ${message}`, this.maxRetries);
      logger.warn(deadLettered ? "dead-lettered (max retries)" : "retry scheduled", {
        wallet: job.walletAddress,
        amount,
        code: code ?? "ERROR",
      });
    }
  }

  /**
   * Settles a marketplace purchase: verify the buyer's on-chain payment to the
   * treasury, transfer hero ownership in the DB, then send the seller payout
   * (price × 0.95) from the treasury using sendOnChain.
   */
  private async processMarketplacePurchaseJob(job: IInboundTransaction): Promise<void> {
    const id = String(job._id);
    try {
      const result = await settleMarketplacePurchase(
        job,
        this.sendOnChain,
        config.mint.verifyMaxTries,
      );

      if (result.ok) {
        await completeJob(id);
        logger.info("settled marketplace_purchase", {
          txId:        job.signature,
          heroId:      job.heroId,
          buyerWallet: job.buyerWallet ?? job.walletAddress,
        });
        return;
      }

      // Non-retryable codes: dead-letter immediately.
      if (!result.retryable) {
        await failJob(id, `${result.code}: ${result.error}`, 1);
        logger.warn("dead-lettered marketplace_purchase (non-retryable)", {
          txId: job.signature,
          code: result.code,
        });
        return;
      }

      // Retryable (NOT_CONFIRMED, PAYOUT_FAILED): let the queue retry.
      const deadLettered = await failJob(
        id,
        `${result.code}: ${result.error}`,
        this.maxRetries,
      );
      logger.warn(
        deadLettered ? "dead-lettered marketplace_purchase (max retries)" : "marketplace_purchase retry scheduled",
        { txId: job.signature, code: result.code },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const deadLettered = await failJob(id, `MARKETPLACE_ERROR: ${message}`, this.maxRetries);
      logger.warn(
        deadLettered
          ? "dead-lettered marketplace_purchase (unexpected error)"
          : "marketplace_purchase retry scheduled (unexpected error)",
        { txId: job.signature, error: message },
      );
    }
  }

  /**
   * Settles a mint: verify the player's on-chain payment, atomically claim the
   * txId in the ledger, and insert the heroes. This is the ONLY place minting
   * happens — the browser never mints, it only enqueued this row.
   */
  private async processMintJob(job: IInboundTransaction): Promise<void> {
    const id = String(job._id);
    const count = job.mintCount ?? 0;
    const mintedNumbers = job.mintedNumbers ?? [];

    let result;
    try {
      result = await verifyAndMintHeroes(job.walletAddress, count, mintedNumbers, job.signature, {
        verifyMaxTries: config.mint.verifyMaxTries,
      });
    } catch (err) {
      // Unexpected infra error (DB/RPC): transient, retry via poll.
      const message = err instanceof Error ? err.message : String(err);
      const deadLettered = await failJob(id, `MINT_ERROR: ${message}`, config.mint.workerMaxRetries);
      logger.warn(deadLettered ? "dead-lettered mint (max retries)" : "mint retry scheduled", {
        wallet: job.walletAddress,
        txId: job.signature,
        code: "MINT_ERROR",
      });
      return;
    }

    // Success, or the txId was already claimed (a previous run minted it):
    // either way the heroes exist, so the job is done.
    if (result.ok || result.code === "ALREADY_PROCESSED") {
      await completeJob(id);
      logger.info("settled mint", {
        wallet: job.walletAddress,
        count,
        txId: job.signature,
        alreadyProcessed: !result.ok,
        minted: result.heroes.length,
      });
      return;
    }

    // Confirmed-but-invalid payment: terminal, dead-letter immediately.
    if (result.code && NON_RETRYABLE_MINT.has(result.code)) {
      await failJob(id, `${result.code}: ${result.error ?? "invalid mint"}`, 1);
      logger.warn("dead-lettered mint (non-retryable)", {
        wallet: job.walletAddress,
        txId: job.signature,
        code: result.code,
      });
      return;
    }

    // NOT_CONFIRMED (or anything else): transient, retry on the next drain.
    const deadLettered = await failJob(
      id,
      `${result.code ?? "NOT_CONFIRMED"}: ${result.error ?? "payment not confirmed yet"}`,
      config.mint.workerMaxRetries,
    );
    logger.warn(deadLettered ? "dead-lettered mint (max retries)" : "mint retry scheduled", {
      wallet: job.walletAddress,
      txId: job.signature,
      code: result.code ?? "NOT_CONFIRMED",
    });
  }
}

/** Convenience for logging queue depth at boot / on heartbeat. */
export async function logQueueDepth(): Promise<void> {
  const counts = await countJobsByStatus();
  logger.info("queue depth", counts);
}
