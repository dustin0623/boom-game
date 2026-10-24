import { HiveOperationError } from "./error";
import type { NativeSymbol, PaymentExpectation } from "hivexph-sdk";
import { z } from "zod";

/** Hive account names: 3–16 characters, with DNS-style labels of at least three. */
export function isValidHiveUsername(username: string): boolean {
  const account = username.trim().toLowerCase();
  return (
    account.length >= 3 &&
    account.length <= 16 &&
    !/[^a-z0-9.-]/.test(account) &&
    account.split(".").every((label) => /^[a-z][a-z0-9-]+[a-z0-9]$/.test(label))
  );
}

export const hiveUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidHiveUsername, "Invalid Hive username");

export function normalizeHiveUsername(
  username: string,
  message = "Invalid Hive username",
): string {
  const account = username.trim().toLowerCase();
  if (!isValidHiveUsername(account))
    throw new HiveOperationError("INVALID_ACCOUNT", message);
  return account;
}
export function validateQuantity(
  value: string,
  precision = 8,
  symbol = "Token",
): void {
  const fraction = precision === 0 ? "" : "(?:\\.\\d{1," + precision + "})?";
  if (
    !Number.isSafeInteger(precision) ||
    precision < 0 ||
    precision > 8 ||
    !new RegExp("^(?:0|[1-9]\\d*)" + fraction + "$").test(value) ||
    /^0(?:\.0+)?$/.test(value)
  )
    throw new HiveOperationError(
      "INVALID_AMOUNT",
      symbol + " amount has invalid precision or value",
    );
}

/** Exact nonnegative token units, including read balances of zero. */
export function tokenQuantityUnits(value: string, precision: number): bigint {
  if (
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 8 ||
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw new HiveOperationError("INVALID_AMOUNT", "Invalid token quantity");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > precision)
    throw new HiveOperationError("INVALID_AMOUNT", "Invalid token precision");
  return BigInt(whole + fraction.padEnd(precision, "0"));
}
export function validateNativeSymbol(
  symbol: string,
): asserts symbol is NativeSymbol {
  if (symbol !== "HIVE" && symbol !== "HBD")
    throw new HiveOperationError(
      "VERIFICATION_FAILED",
      "Unsupported native Hive asset",
    );
}
export function paymentExpectation(
  transactionId: string,
  expected: PaymentExpectation,
): PaymentExpectation {
  if (!transactionId.trim())
    throw new HiveOperationError(
      "VERIFICATION_FAILED",
      "A transaction ID is required",
    );
  return {
    ...expected,
    ...(expected.from ? { from: normalizeHiveUsername(expected.from) } : {}),
    ...(expected.account
      ? { account: normalizeHiveUsername(expected.account) }
      : {}),
  };
}
