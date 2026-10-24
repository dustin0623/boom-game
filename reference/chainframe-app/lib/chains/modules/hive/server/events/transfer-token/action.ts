import type { EnginePaymentInput, AccountReference } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import {
  normalizeHiveUsername,
  validateQuantity,
} from "@/lib/utils/hive/validation";
import { normalizeHiveError } from "@/lib/utils/hive/error";
import { normalizeTransfer } from "@/lib/utils/hive/payment";

export async function transferToken(
  input: EnginePaymentInput & { from: AccountReference },
) {
  const account = normalizeHiveUsername(input.account);
  validateQuantity(input.quantity, 8, input.symbol);
  try {
    const from = normalizeHiveUsername(
      hiveClient.resolveAccount(input.from.alias).account,
    );
    const result = await hiveClient.payments.engine.transfer({
      ...input,
      account,
      from: input.from,
    });
    return normalizeTransfer(result, { ...input, account, from });
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
