import "dotenv/config";
import { wait } from "./utils/wait";
import {
  initializeContractDatabase,
  disconnectContractDatabase,
} from "@/server/game-smart-contract/utils/database.server";
import { config } from "@/lib/config/config";
import { observeHivePayment } from "@/server/game-smart-contract/features/events/payment-processing/intake";
import { TransactionWorker } from "./workers/transaction-worker";
import { runGameActionStreamWorker } from "./workers/game-action-stream-worker";
import { type GameActionStreamPosition } from "@/server/game-smart-contract/features/types/stream";
import { logger } from "@/lib/logger.server";

async function main() {
  if (!config.blockchain.treasuryAccount)
    throw new Error("HIVE_TREASURY_ACCOUNT is required");
  if (!config.blockchain.marketAccount)
    throw new Error("HIVE_MARKET_ACCOUNT is required");
  if (!process.env.HIVE_MARKET_ACTIVE_KEY)
    throw new Error("HIVE_MARKET_ACTIVE_KEY is required");
  if (
    process.env.NEXT_PUBLIC_HIVE_MARKET_ACCOUNT !==
    config.blockchain.marketAccount
  )
    throw new Error(
      "NEXT_PUBLIC_HIVE_MARKET_ACCOUNT must match HIVE_MARKET_ACCOUNT; rebuild the application after changes",
    );
  await initializeContractDatabase();
  const controller = new AbortController();
  const position: GameActionStreamPosition = {};
  const shutdown = () => {
    logger.info("Stopping intake and draining current settlement");
    controller.abort();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    while (!controller.signal.aborted) {
      let payments: TransactionWorker | undefined;
      try {
        await runGameActionStreamWorker({
          position,
          signal: controller.signal,
          onStart: async (checkLease, recoverGameplay) => {
            payments = new TransactionWorker(
              undefined,
              undefined,
              checkLease,
              recoverGameplay,
            );
            payments.start();
          },
          onPayment: async (payment) => {
            await observeHivePayment(payment);
          },
          onStop: async () => {
            await payments?.stop();
          },
        });
        if (!controller.signal.aborted) throw new Error("Hive stream ended");
      } catch {
        if (controller.signal.aborted) break;
        logger.error("Smart-contract worker recovering", {
          code: "WORKER_RECOVERY_REQUIRED",
        });
        await wait(5000, controller.signal);
      }
    }
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    await disconnectContractDatabase();
  }
}
main().catch(() => {
  logger.error("Fatal smart-contract startup error", {
    code: "WORKER_STARTUP_FAILED",
  });
  process.exitCode = 1;
});
