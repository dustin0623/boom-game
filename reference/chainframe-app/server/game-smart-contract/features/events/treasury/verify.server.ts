import { quantitiesEqual } from "hivexph-sdk";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import { verifyTokenPayment } from "@/lib/chains/modules/hive/server/events/verify-token-payment/action";
import { verifyNativePayment } from "@/lib/chains/modules/hive/server/events/verify-native-payment/action";
import { verifyTokenExecution } from "@/lib/chains/modules/hive/server/events/verify-token-execution/action";
import { config } from "@/lib/config/config";
import type { TreasuryIntent } from "@/lib/modules/transactions-pending/server.types";
import { SettlementUncertainError } from "./errors.server";

export async function verifyTreasuryTransfer(
  intent: TreasuryIntent,
  transactionId: string,
  operationIndex?: number,
) {
  const alias = intent.accountAlias;
  const configuredFrom =
    alias === "market"
      ? config.blockchain.marketAccount
      : config.blockchain.treasuryAccount;
  if (
    !configuredFrom ||
    !intent.from ||
    intent.from !== configuredFrom ||
    (alias !== "market" && alias !== "treasury")
  )
    throw new SettlementUncertainError(
      "Signing account no longer matches recorded transfer intent",
    );
  let resolvedFrom: string;
  try {
    resolvedFrom = hiveClient.resolveAccount(alias).account;
  } catch {
    throw new SettlementUncertainError(
      "Cannot resolve recorded signing account",
    );
  }
  if (resolvedFrom !== configuredFrom)
    throw new SettlementUncertainError(
      "SDK signing account differs from recorded transfer routing",
    );
  const expected = {
    from: intent.from,
    account: intent.to,
    symbol: intent.symbol,
  };
  if (
    intent.operation !== undefined &&
    (!["transfer", "issue"].includes(intent.operation) ||
      alias !== "treasury" ||
      intent.symbol === "HIVE" ||
      intent.symbol === "HBD")
  )
    throw new SettlementUncertainError("Unsupported treasury operation");
  const memo = JSON.stringify({
    action:
      alias !== "market" &&
      (intent.symbol === "HIVE" || intent.symbol === "HBD")
        ? "refund"
        : "withdrawal",
    metadata: { memo: intent.memo },
  });
  const payment =
    intent.operation !== undefined
      ? await verifyTokenExecution({
          transactionId,
          operation: intent.operation,
          operationIndex,
          expected: {
            from: intent.from,
            account: intent.to,
            symbol: intent.symbol,
            quantity: intent.quantity,
            memo,
          },
        })
      : intent.symbol === "HIVE" || intent.symbol === "HBD"
        ? await verifyNativePayment({
            transactionId,
            expected,
            requireTransferEvidence: true,
          })
        : await verifyTokenPayment({
            transactionId,
            expected,
            requireTransferEvidence: true,
          });
  if (payment.invalid)
    throw new SettlementUncertainError(
      "Treasury evidence is invalid or ambiguous",
    );
  if (payment.status === "pending") return { status: "pending" as const };
  if (
    payment.transactionId !== transactionId ||
    payment.from !== expected.from ||
    payment.to !== intent.to ||
    payment.symbol !== intent.symbol ||
    !quantitiesEqual(payment.amount, intent.quantity) ||
    payment.memo !== memo ||
    payment.operationIndex === undefined ||
    !Number.isInteger(payment.operationIndex) ||
    payment.operationIndex < 0 ||
    payment.blockNumber === undefined ||
    !Number.isInteger(payment.blockNumber) ||
    payment.blockNumber < 1 ||
    (operationIndex !== undefined && payment.operationIndex !== operationIndex)
  )
    throw new SettlementUncertainError(
      "Treasury evidence does not match recorded intent",
    );
  if (payment.status === "failed" && !payment.failureProven)
    throw new SettlementUncertainError("Treasury failure is not proven");
  if (payment.status === "confirmed" && !payment.success)
    throw new SettlementUncertainError("Treasury execution is not proven");
  return {
    status: payment.status,
    evidence: {
      state: payment.status,
      blockNumber: payment.blockNumber,
      operationIndex: payment.operationIndex,
      error: payment.error,
    },
  };
}
