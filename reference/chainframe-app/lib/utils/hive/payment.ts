import type {
  KeychainResult,
  ParsedPayment,
  IssuerTransactionResult,
} from "hivexph-sdk";
import type {
  HivePaymentVerification,
  HiveTransferResult,
} from "@/lib/chains/modules/hive/server/types";

export class PaymentBroadcastUncertain extends Error {
  constructor() {
    super("Payment submitted without a transaction id. Check Hive history.");
    this.name = "PaymentBroadcastUncertain";
  }
}
export function walletPaymentResult(result: KeychainResult): {
  transactionId: string;
} {
  if (!result.transactionId) throw new PaymentBroadcastUncertain();
  return { transactionId: result.transactionId };
}
export function normalizePayment(
  payment: ParsedPayment,
  irreversibleBlock?: number,
): HivePaymentVerification {
  let status: HivePaymentVerification["status"] =
    payment.status === "success"
      ? "confirmed"
      : payment.status === "failed"
        ? "failed"
        : "pending";
  if (
    status === "confirmed" &&
    (!payment.blockNumber ||
      irreversibleBlock === undefined ||
      payment.blockNumber > irreversibleBlock)
  )
    status = "pending";
  return {
    ...(payment.status === "invalid" ? { invalid: true } : {}),
    success: payment.success === true && status === "confirmed",
    operationIndex: payment.operationIndex,
    trigger: payment.trigger,
    memo: payment.transfer.memo ?? null,
    symbol: payment.transfer.symbol,
    status,
    transactionId: payment.transactionId ?? "",
    blockNumber: payment.blockNumber,
    from: payment.transfer.from,
    to: payment.transfer.account,
    amount: payment.transfer.quantity,
    error: payment.error,
  };
}
export function normalizeTransfer(
  result: IssuerTransactionResult,
  input: {
    from: string;
    account: string;
    quantity: string;
    symbol: string;
    action: string;
    metadata?: unknown;
  },
): HiveTransferResult {
  return {
    success: result.success,
    transactionId: result.transactionId,
    from: input.from,
    to: input.account,
    amount: input.quantity,
    symbol: input.symbol,
    memo: JSON.stringify({
      action: input.action,
      metadata: input.metadata ?? null,
    }),
  };
}
export function parseAsset(value: unknown): string {
  return typeof value === "string" ? (value.trim().split(" ")[0] ?? "0") : "0";
}
