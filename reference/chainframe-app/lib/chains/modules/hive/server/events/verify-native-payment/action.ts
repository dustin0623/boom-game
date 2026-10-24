import type { PaymentValidateInput } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import {
  paymentExpectation,
  validateNativeSymbol,
} from "@/lib/utils/hive/validation";
import { normalizeHiveError } from "@/lib/utils/hive/error";
import { normalizePayment } from "@/lib/utils/hive/payment";

export async function verifyNativePayment(
  input: PaymentValidateInput & {
    expected: { from?: string; account: string; symbol: string };
    requireTransferEvidence?: boolean;
    includeBlockTimestamp?: boolean;
  },
) {
  validateNativeSymbol(input.expected.symbol);
  const expected = paymentExpectation(input.transactionId, input.expected);
  try {
    const { includeBlockTimestamp, ...validationInput } = input;
    const payment = await hiveClient.payments.validate({ ...validationInput, expected });
    const finality =
      payment.status === "success"
        ? (await hiveClient.rpc.getDynamicGlobalProperties())
            .last_irreversible_block_num
        : undefined;
    const normalized = normalizePayment(payment, finality);
    if (
      input.requireTransferEvidence &&
      payment.status !== "pending" &&
      payment.status !== "not_found"
    ) {
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
    }
    if (includeBlockTimestamp && normalized.success && normalized.blockNumber) {
      const canonical = await hiveClient.rpc.getBlock(normalized.blockNumber);
      const indexes = canonical?.transaction_ids?.flatMap((id, index) => id === input.transactionId ? [index] : []) ?? [];
      const raw = indexes.length === 1 && normalized.operationIndex !== undefined
        ? canonical?.transactions[indexes[0]]?.operations[normalized.operationIndex] : undefined;
      const op = Array.isArray(raw) ? raw : raw && "type" in raw ? [raw.type.replace(/_operation$/, ""), raw.value] : undefined;
      if (canonical && op?.[0] === "transfer") {
        const body = op[1] as { from?: string; to?: string; amount?: string; memo?: string };
        if (body.from === normalized.from && body.to === normalized.to &&
            body.amount === normalized.amount + " " + normalized.symbol && body.memo === normalized.memo &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/.test(canonical.timestamp) &&
            Number.isFinite(Date.parse(canonical.timestamp.endsWith("Z") ? canonical.timestamp : canonical.timestamp + "Z"))) {
          return { ...normalized, blockTimestamp: canonical.timestamp };
        }
      }
      // Missing or mismatching canonical evidence never supplies an event time.
    }
    return normalized;
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
