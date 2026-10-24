import { config } from "@/lib/config/config";
import { logger } from "@/lib/logger.server";
import { drainPaymentJobs } from "@/server/game-smart-contract/features/events/payment-processing/drain";

/** Runtime scheduling only; settlement workflows belong to feature events. */
export class TransactionWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private inFlight: Promise<void> | null = null;
  constructor(
    private readonly pollMs: number = config.withdrawal.workerPollMs,
    private readonly maxRetries: number = config.withdrawal.maxRetries,
    private readonly checkLease: () => Promise<void> = async () => {},
    private readonly recoverGameplay: () => Promise<void> = async () => {},
  ) {}
  start(): void {
    logger.info(
      `Transaction queue started — polling every ${this.pollMs}ms, maxRetries=${this.maxRetries}`,
    );
    void this.scheduledDrain();
    this.timer = setInterval(() => void this.scheduledDrain(), this.pollMs);
  }
  private async scheduledDrain(): Promise<void> {
    try {
      await this.drain();
    } catch {
      logger.error("Saved gameplay recovery stopped", {
        stage: "recovery",
        code: "RECOVERY_UNAVAILABLE",
      });
    }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("Transaction queue stopped");
    await this.inFlight;
  }
  async drain(): Promise<void> {
    if (this.stopped) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.recoverGameplay().then(() =>
      drainPaymentJobs(
        { checkLease: this.checkLease, maxRetries: this.maxRetries },
        () => this.stopped,
      ),
    );
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
}
