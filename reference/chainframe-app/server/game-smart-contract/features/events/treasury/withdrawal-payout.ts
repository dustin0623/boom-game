import { getTokenState } from "@/lib/chains/modules/hive/server/events/get-token-state/action";
import { getPendingTreasuryTransfer } from "@/lib/modules/transactions-pending/server.repository";
import { getArchivedTreasuryTransfer } from "@/lib/modules/transactions-processed/server.repository";
import type {
  IInboundTransaction,
  TreasuryIntent,
} from "@/lib/modules/transactions-pending/server.types";
import { config } from "@/lib/config/config";
import { tokenQuantityUnits } from "@/lib/utils/hive/validation";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { dispatchTreasuryTransfer } from "./dispatch";
import { SettlementUncertainError } from "./errors.server";

/** Select once before the journal claim; saved payouts never consult liquidity again. */
export async function dispatchWithdrawalPayout(
  context: SettlementContext,
  job: IInboundTransaction,
) {
  const policy = job.withdrawalPayoutPolicyVersion;
  if (policy !== undefined && policy !== 1)
    throw new SettlementUncertainError("Unsupported withdrawal payout policy");
  const key = `processWithdrawal:${job.signature}`;
  const saved =
    (await getArchivedTreasuryTransfer(key)) ??
    (await getPendingTreasuryTransfer(job.signature, key));
  const quantity = job.withdrawAmount!.toFixed(
    config.blockchain.tokenPrecision,
  );
  let operation: TreasuryIntent["operation"];
  if (saved) {
    operation = saved.intent.operation;
    if (
      (policy === 1 && operation !== "transfer" && operation !== "issue") ||
      (policy === undefined && operation !== undefined)
    )
      throw new SettlementUncertainError(
        "Withdrawal payout policy and intent differ",
      );
  } else if (policy === 1) {
    await context.checkLease();
    try {
      const state = await getTokenState(
        config.blockchain.treasuryAccount,
        config.blockchain.token,
      );
      if (state.precision !== config.blockchain.tokenPrecision)
        throw new Error("Token precision differs from configuration");
      const amount = tokenQuantityUnits(quantity, state.precision);
      operation =
        tokenQuantityUnits(state.balance, state.precision) >= amount
          ? "transfer"
          : "issue";
      if (
        operation === "issue" &&
        (state.issuer !== config.blockchain.treasuryAccount ||
          tokenQuantityUnits(state.maxSupply, state.precision) -
            tokenQuantityUnits(state.supply, state.precision) <
            amount)
      )
        throw new Error("Token issuance prerequisites unavailable");
    } catch (cause) {
      throw new SettlementUncertainError(
        "Withdrawal token state or issuance prerequisites unavailable",
        { cause },
      );
    }
  }
  return dispatchTreasuryTransfer(
    context,
    job.signature,
    key,
    job.walletAddress,
    quantity,
    config.blockchain.token,
    `Chainframe withdrawal ${job.signature}`,
    "treasury",
    saved?.intent.from,
    operation,
  );
}
