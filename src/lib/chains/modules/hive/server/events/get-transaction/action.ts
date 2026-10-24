import { z } from "zod";
import { getHiveClient, type HiveClient } from "../../../client";
import { TransactionIdSchema, ok, fail, type HiveActionResult } from "../../../types";
import type { TransactionResult } from "hivexph-sdk";

export const GetTransactionInput = z.object({
  transactionId: TransactionIdSchema,
  /** Optional custom_json id filter. */
  id: z.string().trim().min(1).optional(),
  /** Optional standardized action filter. */
  actions: z.array(z.string().trim().min(1)).optional(),
  client: z.custom<HiveClient>().optional(),
});

export type GetTransactionInput = z.input<typeof GetTransactionInput>;

/**
 * Read one transaction by id, with every operation normalized and positioned.
 * Layer 2 payments stay `pending` here — use `validatePayment` to confirm them.
 */
export async function getTransaction(
  input: GetTransactionInput,
): Promise<HiveActionResult<TransactionResult>> {
  const parsed = GetTransactionInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { transactionId, id, actions } = parsed.data;
  const hive = parsed.data.client ?? getHiveClient();

  try {
    return ok(
      await hive.reader.transaction({ transactionId, ...(id ? { id } : {}), ...(actions ? { actions } : {}) }),
    );
  } catch (error) {
    return fail(error);
  }
}
