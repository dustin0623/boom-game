import {
  getPendingTreasuryTransfer,
  claimTreasuryTransfer,
  submitTreasuryTransfer,
  recordTreasuryVerification,
} from "@/lib/modules/transactions-pending/server.repository";
import { getArchivedTreasuryTransfer } from "@/lib/modules/transactions-processed/server.repository";
import type { TreasuryIntent } from "@/lib/modules/transactions-pending/server.types";
import {
  SettlementUncertainError,
  TreasuryPendingError,
  TreasuryFailedError,
} from "./errors.server";
import { verifyTreasuryTransfer } from "./verify.server";
import { config } from "@/lib/config/config";
import { HiveOperationError } from "@/lib/utils/hive/error";
import { logger } from "@/lib/logger.server";

const safeSendCodes = new Set([
  "ACCOUNT_NOT_FOUND",
  "INVALID_ACCOUNT",
  "INSUFFICIENT_BALANCE",
  "INVALID_AMOUNT",
  "BROADCAST_FAILED",
  "VERIFICATION_FAILED",
  "NETWORK_ERROR",
  "TIMEOUT",
  "UNKNOWN_ERROR",
]);

export type TreasuryOutcome = {
  status: "pending" | "confirmed" | "failed";
  success: boolean;
  transactionId?: string;
};
export function requireConfirmedTransfer(
  result: TreasuryOutcome,
): asserts result is TreasuryOutcome & {
  status: "confirmed";
  transactionId: string;
} {
  if (result.status === "pending") throw new TreasuryPendingError();
  if (result.status === "failed") throw new TreasuryFailedError();
  if (result.status !== "confirmed" || !result.success || !result.transactionId)
    throw new SettlementUncertainError("Missing verified transfer");
}

export async function dispatchTreasuryOnce(
  jobSignature: string,
  key: string,
  intent: TreasuryIntent,
  send: () => Promise<{ success: boolean; transactionId?: string }>,
): Promise<TreasuryOutcome> {
  const configuredFrom =
    intent.accountAlias === "market"
      ? config.blockchain.marketAccount
      : config.blockchain.treasuryAccount;
  if (
    !intent.from ||
    intent.from !== configuredFrom ||
    !["market", "treasury"].includes(intent.accountAlias)
  )
    throw new SettlementUncertainError(
      "Signing account no longer matches recorded transfer",
    );
  if (
    intent.operation !== undefined &&
    (!["transfer", "issue"].includes(intent.operation) ||
      intent.accountAlias !== "treasury" ||
      intent.symbol === "HIVE" ||
      intent.symbol === "HBD")
  )
    throw new SettlementUncertainError("Unsupported treasury operation");
  let existing =
    (await getArchivedTreasuryTransfer(key)) ??
    (await getPendingTreasuryTransfer(jobSignature, key));
  if (
    existing &&
    (existing.intent.to !== intent.to ||
      existing.intent.symbol !== intent.symbol ||
      existing.intent.quantity !== intent.quantity ||
      existing.intent.memo !== intent.memo ||
      existing.intent.accountAlias !== intent.accountAlias ||
      existing.intent.from !== intent.from ||
      existing.intent.operation !== intent.operation)
  )
    throw new SettlementUncertainError(
      "Treasury transfer intent changed: " + key,
    );
  if (
    existing?.verifiedAt &&
    existing.transactionId &&
    Number.isInteger(existing.operationIndex) &&
    Number.isInteger(existing.blockNumber) &&
    (existing.state === "confirmed" || existing.state === "failed")
  )
    return {
      status: existing.state,
      success: existing.state === "confirmed",
      transactionId: existing.transactionId,
    };
  if (
    existing &&
    (!existing.transactionId || existing.state === "broadcasting")
  ) {
    logger.warn("treasury transfer remains parked", {
      signature: jobSignature,
      transferIdentity: key,
      stage: "existing-transfer",
      code: "UNCERTAIN_BROADCAST",
    });
    throw new SettlementUncertainError(key);
  }
  if (!existing) {
    if (!(await claimTreasuryTransfer(jobSignature, key, intent)))
      throw new SettlementUncertainError(key);
    let stage = "send";
    let code = "SEND_EXCEPTION";
    try {
      const result = await send();
      if (!result.success || !result.transactionId) {
        code = result.success
          ? "MISSING_TRANSACTION_ID"
          : "UNSUCCESSFUL_RESULT";
        throw new Error("Missing treasury transaction ID");
      }
      stage = "record-submission";
      code = "SUBMISSION_RECORD_FAILED";
      await submitTreasuryTransfer(jobSignature, key, result.transactionId);
      existing = {
        key,
        intent,
        state: "submitted",
        transactionId: result.transactionId,
      };
    } catch (error) {
      // Allowlisted codes only: SDK/RPC messages and raw errors can contain sensitive data.
      if (
        stage === "send" &&
        error instanceof HiveOperationError &&
        safeSendCodes.has(error.code)
      )
        code = error.code;
      logger.error("treasury transfer requires reconciliation", {
        signature: jobSignature,
        transferIdentity: key,
        stage,
        code,
      });
      throw new SettlementUncertainError(key, { cause: error });
    }
  }
  let verified;
  try {
    verified = await verifyTreasuryTransfer(
      intent,
      existing.transactionId!,
      existing.operationIndex,
    );
  } catch (error) {
    if (error instanceof SettlementUncertainError) throw error;
    return {
      status: "pending",
      success: false,
      transactionId: existing.transactionId,
    };
  }
  if (verified.status === "pending")
    return {
      status: "pending",
      success: false,
      transactionId: existing.transactionId,
    };
  await recordTreasuryVerification(
    jobSignature,
    key,
    existing.transactionId!,
    verified.evidence,
  );
  return {
    status: verified.status,
    success: verified.status === "confirmed",
    transactionId: existing.transactionId,
  };
}
