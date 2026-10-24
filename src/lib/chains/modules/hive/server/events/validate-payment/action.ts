import { z } from "zod";
import { getHiveClient, type HiveClient } from "../../../client";
import {
  HiveAccountSchema,
  SymbolSchema,
  QuantitySchema,
  TransactionIdSchema,
  ok,
  fail,
  type HiveActionResult,
} from "../../../types";
import type { PaymentValidationResult, PaymentExpectation } from "hivexph-sdk";

export const ValidatePaymentInput = z.object({
  transactionId: TransactionIdSchema,
  expected: z
    .object({
      from: HiveAccountSchema.optional(),
      account: HiveAccountSchema.optional(),
      symbol: SymbolSchema.optional(),
      quantity: QuantitySchema.optional(),
      action: z.string().trim().min(1).optional(),
    })
    .optional(),
  client: z.custom<HiveClient>().optional(),
});

export type ValidatePaymentInput = z.input<typeof ValidatePaymentInput>;

/**
 * Confirm a payment exists, executed (Hive Engine included) and matches what
 * the game expected. The transaction worker MUST call this before crediting
 * a deposit or finalizing a withdrawal.
 */
export async function validatePayment(
  input: ValidatePaymentInput,
): Promise<HiveActionResult<PaymentValidationResult>> {
  const parsed = ValidatePaymentInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { transactionId, expected } = parsed.data;
  const hive = parsed.data.client ?? getHiveClient();

  // Drop undefined keys: the SDK's expectation type has no optional-undefined members.
  const cleaned = expected
    ? (Object.fromEntries(Object.entries(expected).filter(([, v]) => v !== undefined)) as PaymentExpectation)
    : undefined;

  try {
    return ok(await hive.payments.validate({ transactionId, ...(cleaned ? { expected: cleaned } : {}) }));
  } catch (error) {
    return fail(error);
  }
}
