import type { KeychainEnginePaymentInput } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import {
  normalizeHiveUsername,
  validateQuantity,
} from "@/lib/utils/hive/validation";
import { walletPaymentResult } from "@/lib/utils/hive/payment";

export async function transferToken(
  input: KeychainEnginePaymentInput,
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
  validateQuantity(input.quantity, 8, input.symbol);
  return walletPaymentResult(
    await hiveClient.keychain.payments.engine.transfer({
      ...input,
      username,
      account,
    }),
  );
}
