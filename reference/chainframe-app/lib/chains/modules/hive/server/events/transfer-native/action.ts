import type { HivePaymentInput, AccountReference } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import {
  normalizeHiveUsername,
  validateQuantity,
  validateNativeSymbol,
} from "@/lib/utils/hive/validation";
import { normalizeHiveError } from "@/lib/utils/hive/error";
import { normalizeTransfer } from "@/lib/utils/hive/payment";

export async function transferNative(
  input: HivePaymentInput & { from: AccountReference },
) {
  const account = normalizeHiveUsername(input.account);
  validateNativeSymbol(input.symbol);
  validateQuantity(input.amount, 3, input.symbol);
  try {
    const from = normalizeHiveUsername(
      hiveClient.resolveAccount(input.from.alias).account,
    );
    const result = await hiveClient.payments.hive.transfer({
      ...input,
      account,
      from: input.from,
    });
    return normalizeTransfer(result, {
      ...input,
      account,
      from,
      quantity: input.amount,
    });
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
