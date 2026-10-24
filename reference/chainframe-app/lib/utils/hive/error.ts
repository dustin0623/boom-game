import { HiveSdkError } from "hivexph-sdk";

export type HiveOperationErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "INVALID_ACCOUNT"
  | "INSUFFICIENT_BALANCE"
  | "INVALID_AMOUNT"
  | "BROADCAST_FAILED"
  | "VERIFICATION_FAILED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export class HiveOperationError extends Error {
  constructor(
    readonly code: HiveOperationErrorCode,
    message: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "HiveOperationError";
  }
}
export function normalizeHiveError(error: unknown): HiveOperationError {
  if (error instanceof HiveOperationError) return error;
  if (error instanceof HiveSdkError) {
    const code: HiveOperationErrorCode =
      error.code === "ACCOUNT_ALIAS_NOT_FOUND" ||
      error.code === "ACCOUNT_RESOLUTION_ERROR"
        ? "INVALID_ACCOUNT"
        : error.code === "BROADCAST_ERROR" || error.code === "SIGNING_ERROR"
          ? "BROADCAST_FAILED"
          : error.code === "NOT_FOUND"
            ? "ACCOUNT_NOT_FOUND"
            : error.code === "HTTP_ERROR" || error.code === "RPC_ERROR"
              ? "NETWORK_ERROR"
              : "UNKNOWN_ERROR";
    return new HiveOperationError(code, "Hive operation failed", error);
  }
  return new HiveOperationError(
    "UNKNOWN_ERROR",
    "Hive operation failed",
    error,
  );
}
const keychainMessages: Record<string, string> = {
  incomplete_data:
    "Hive Keychain rejected the request as incomplete. Check the Hive username and try again.",
  user_cancel: "You cancelled the request in Hive Keychain.",
  user_cancelled: "You cancelled the request in Hive Keychain.",
  locked: "Hive Keychain is locked. Unlock it and try again.",
  no_wallet:
    "Hive Keychain has no key for this account. Import the posting key first.",
};
export function describeKeychainError(error: unknown): string {
  const raw = (error as { raw?: { error?: unknown; message?: unknown } })?.raw;
  const code = typeof raw?.error === "string" ? raw.error : "";
  const message = typeof raw?.message === "string" ? raw.message : "";
  return (
    keychainMessages[code] ??
    (message ||
      code ||
      (error instanceof Error ? error.message : "Hive Keychain failed"))
  );
}
