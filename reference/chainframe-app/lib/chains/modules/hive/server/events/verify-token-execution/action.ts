import { HIVE_ENGINE_CUSTOM_JSON_ID, quantitiesEqual } from "hivexph-sdk";
import { z } from "zod";
import { hiveClient } from "../../../client";
import type { HivePaymentVerification } from "../../types";
import { normalizeHiveError } from "@/lib/utils/hive/error";
import {
  paymentExpectation,
  validateQuantity,
} from "@/lib/utils/hive/validation";
import { readHiveOperation } from "@/lib/utils/hive/operation";

const bodySchema = z.object({
  id: z.string(),
  json: z.string(),
  required_auths: z.array(z.string()),
  required_posting_auths: z.array(z.string()),
});
const actionSchema = z.object({
  contractName: z.literal("tokens"),
  contractAction: z.enum(["issue", "transfer"]),
  contractPayload: z.object({
    to: z.string(),
    symbol: z.string(),
    quantity: z.string(),
    memo: z.string(),
  }),
});
const executionSchema = z.object({
  transactionId: z.string(),
  sender: z.string(),
  contract: z.string(),
  action: z.string(),
  payload: z.string(),
});
const logsSchema = z.object({
  errors: z.array(z.unknown()).optional(),
  events: z
    .array(
      z.object({
        contract: z.string(),
        event: z.string(),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .optional(),
});
function json(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function engineOperations(operations: unknown[]) {
  return operations.flatMap((raw, index) => {
    const decoded = readHiveOperation(raw);
    if (
      decoded?.name !== "custom_json" ||
      decoded.value.id !== HIVE_ENGINE_CUSTOM_JSON_ID
    )
      return [];
    const parsed = bodySchema.safeParse(decoded.value);
    return [{ index, body: parsed.success ? parsed.data : null }];
  });
}

/** Exact canonical Hive operation plus Engine execution, without payment-parser inference. */
export async function verifyTokenExecution(input: {
  transactionId: string;
  operation: "transfer" | "issue";
  operationIndex?: number;
  expected: {
    from: string;
    account: string;
    symbol: string;
    quantity: string;
    memo: string;
  };
}): Promise<HivePaymentVerification> {
  const expected = {
    ...input.expected,
    ...paymentExpectation(input.transactionId, input.expected),
  };
  validateQuantity(expected.quantity, 8, expected.symbol);
  const pending: HivePaymentVerification = {
    status: "pending",
    success: false,
    transactionId: input.transactionId,
    from: expected.from,
    to: expected.account,
    symbol: expected.symbol,
    amount: expected.quantity,
    memo: expected.memo,
  };
  const invalid = () => ({ ...pending, invalid: true });
  try {
    const transaction = await hiveClient.reader.transaction({
      transactionId: input.transactionId,
    });
    if (transaction.transactionId !== input.transactionId) return invalid();
    const blockNumber = transaction.blockNumber;
    if (
      blockNumber === null ||
      !Number.isSafeInteger(blockNumber) ||
      blockNumber < 1
    )
      return pending;
    const candidates = engineOperations(
      transaction.operations.map((entry) => entry.raw),
    );
    // Engine logs are transaction-scoped: never attribute multi-action execution by guessing.
    if (candidates.length !== 1) return invalid();
    const candidate = candidates[0];
    if (!candidate.body) return invalid();
    if (
      (input.operationIndex !== undefined &&
        input.operationIndex !== candidate.index) ||
      candidate.body.required_auths.length !== 1 ||
      candidate.body.required_auths[0] !== expected.from ||
      candidate.body.required_posting_auths.length !== 0
    )
      return invalid();
    const action = actionSchema.safeParse(json(candidate.body.json));
    if (!action.success || action.data.contractAction !== input.operation)
      return invalid();
    const payload = action.data.contractPayload;
    const matches = (value: typeof payload) =>
      value.to === expected.account &&
      value.symbol === expected.symbol &&
      quantitiesEqual(value.quantity, expected.quantity) &&
      value.memo === expected.memo;
    if (!matches(payload)) return invalid();
    const properties = await hiveClient.rpc.getDynamicGlobalProperties();
    if (
      !Number.isSafeInteger(properties.last_irreversible_block_num) ||
      blockNumber > properties.last_irreversible_block_num
    )
      return pending;
    const canonical = await hiveClient.rpc.getBlock(blockNumber);
    if (!canonical?.transaction_ids) return pending;
    const indexes = canonical.transaction_ids.flatMap((id, index) =>
      id === input.transactionId ? [index] : [],
    );
    if (indexes.length !== 1) return invalid();
    const index = indexes[0];
    if (
      transaction.transactionIndex !== null &&
      transaction.transactionIndex !== index
    )
      return invalid();
    const canonicalOperations = canonical.transactions[index]?.operations;
    if (!canonicalOperations) return pending;
    const canonicalCandidates = engineOperations(canonicalOperations);
    if (
      canonicalCandidates.length !== 1 ||
      canonicalCandidates[0].index !== candidate.index ||
      JSON.stringify(canonicalCandidates[0].body) !==
        JSON.stringify(candidate.body)
    )
      return invalid();
    pending.blockNumber = blockNumber;
    pending.operationIndex = candidate.index;
    const info = await hiveClient.payments.engineRpc.getTransactionInfo(
      input.transactionId,
    );
    if (!info) return pending;
    const execution = executionSchema.safeParse(info);
    if (!execution.success) return pending;
    if (
      execution.data.transactionId !== input.transactionId ||
      execution.data.sender !== expected.from ||
      execution.data.contract !== "tokens" ||
      execution.data.action !== input.operation
    )
      return invalid();
    const executionPayload = actionSchema.shape.contractPayload.safeParse(
      json(execution.data.payload),
    );
    if (!executionPayload.success || !matches(executionPayload.data))
      return invalid();
    const logs = logsSchema.safeParse(json(info.logs ?? ""));
    if (!logs.success) return pending;
    const events = logs.data.events ?? [];
    if (logs.data.errors?.length) {
      // Any events alongside an error can conceal a write; do not compensate it.
      return events.length
        ? pending
        : {
            ...pending,
            status: "failed",
            failureProven: true,
            error: "Token execution failed",
          };
    }
    if (!events.length) return pending;
    const eventName =
      input.operation === "issue" ? "transferFromContract" : "transfer";
    const from = input.operation === "issue" ? "tokens" : expected.from;
    if (events.length !== 1) return invalid();
    const event = events[0];
    if (
      event.contract !== "tokens" ||
      event.event !== eventName ||
      event.data.from !== from ||
      event.data.to !== expected.account ||
      event.data.symbol !== expected.symbol ||
      typeof event.data.quantity !== "string" ||
      !quantitiesEqual(event.data.quantity, expected.quantity)
    )
      return invalid();
    return { ...pending, status: "confirmed", success: true };
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
