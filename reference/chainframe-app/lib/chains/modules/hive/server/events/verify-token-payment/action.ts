import { quantitiesEqual, type PaymentValidateInput } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import { paymentExpectation } from "@/lib/utils/hive/validation";
import { normalizeHiveError } from "@/lib/utils/hive/error";
import { normalizePayment } from "@/lib/utils/hive/payment";

export async function verifyTokenPayment(
  input: PaymentValidateInput & {
    expected: { from?: string; account: string; symbol: string };
    requireTransferEvidence?: boolean;
  },
) {
  const expected = paymentExpectation(input.transactionId, input.expected);
  try {
    const payment = await hiveClient.payments.validate({ ...input, expected });
    const finality =
      payment.status === "success" ||
      (input.requireTransferEvidence && payment.status === "failed")
        ? (await hiveClient.rpc.getDynamicGlobalProperties())
            .last_irreversible_block_num
        : undefined;
    const normalized = normalizePayment(payment, finality);
    if (
      !input.requireTransferEvidence ||
      payment.status === "pending" ||
      payment.status === "not_found"
    )
      return normalized;
    const payments = await hiveClient.payments.parse({
      transactionId: input.transactionId,
    });
    const candidates = payments.filter(
      ({ transfer }) =>
        transfer.from === expected.from &&
        transfer.account === expected.account &&
        transfer.symbol === expected.symbol,
    );
    if (
      candidates.length !== 1 ||
      candidates[0].operationIndex !== payment.operationIndex
    )
      return { ...normalized, invalid: true };
    if (
      !payment.blockNumber ||
      finality === undefined ||
      payment.blockNumber > finality
    )
      return { ...normalized, success: false, status: "pending" as const };
    const info = await hiveClient.payments.engineRpc.getTransactionInfo(
      input.transactionId,
    );
    let logs: {
      errors?: unknown[];
      events?: { event?: string; data?: Record<string, unknown> }[];
    };
    try {
      logs = JSON.parse(info?.logs ?? "");
    } catch {
      return { ...normalized, success: false, status: "pending" as const };
    }
    if (!logs || typeof logs !== "object")
      return { ...normalized, success: false, status: "pending" as const };
    const transfers = Array.isArray(logs.events)
      ? logs.events.filter((event) => event.event === "transfer")
      : [];
    const matched = transfers.filter(
      ({ data }) =>
        data?.from === expected.from &&
        data?.to === expected.account &&
        data?.symbol === expected.symbol &&
        quantitiesEqual(String(data?.quantity), payment.transfer.quantity),
    );
    if (transfers.length && matched.length !== 1)
      return { ...normalized, invalid: true };
    if (
      payment.status === "success" &&
      matched.length === 1 &&
      !logs.errors?.length
    )
      return normalized;
    if (
      payment.status === "failed" &&
      Array.isArray(logs.errors) &&
      logs.errors.length > 0 &&
      transfers.length === 0
    )
      return {
        ...normalized,
        success: false,
        status: "failed" as const,
        failureProven: true,
      };
    return { ...normalized, success: false, status: "pending" as const };
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
