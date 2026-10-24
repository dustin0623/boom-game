import type { KeychainHivePaymentInput } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import {
  normalizeHiveUsername,
  validateQuantity,
  validateNativeSymbol,
} from "@/lib/utils/hive/validation";
import { walletPaymentResult } from "@/lib/utils/hive/payment";

export async function transferNative(
  input: KeychainHivePaymentInput,
): Promise<{ transactionId: string }> {
  if (!hiveClient.keychain.isAvailable())
    throw new Error("Hive Keychain is not installed");
  const username = normalizeHiveUsername(
    input.username,
    "Enter a valid Hive username",
  );
  const account = normalizeHiveUsername(
    input.account,
    "Hive treasury is not configured",
  );
  validateNativeSymbol(input.symbol);
  validateQuantity(input.amount, 3, input.symbol);
  return walletPaymentResult(
    await hiveClient.keychain.payments.hive.transfer({
      ...input,
      username,
      account,
    }),
  );
}
