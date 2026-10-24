import { describe, expect, it } from "vitest";
import { HiveSdkError } from "hivexph-sdk";
import { HiveOperationError, normalizeHiveError } from "./error";
describe("Hive operation errors", () => {
  it.each([
    ["RPC_ERROR", "NETWORK_ERROR"],
    ["HTTP_ERROR", "NETWORK_ERROR"],
    ["BROADCAST_ERROR", "BROADCAST_FAILED"],
    ["SIGNING_ERROR", "BROADCAST_FAILED"],
    ["NOT_FOUND", "ACCOUNT_NOT_FOUND"],
    ["ACCOUNT_ALIAS_NOT_FOUND", "INVALID_ACCOUNT"],
    ["ACCOUNT_RESOLUTION_ERROR", "INVALID_ACCOUNT"],
  ])(
    "retains the %s category without exposing SDK details",
    (code, expected) => {
      const result = normalizeHiveError(
        new HiveSdkError(code as never, "private diagnostic"),
      );
      expect(result.code).toBe(expected);
      expect(result.message).toBe("Hive operation failed");
    },
  );
  it("preserves an already normalized error", () => {
    const error = new HiveOperationError("INVALID_AMOUNT", "bad amount");
    expect(normalizeHiveError(error)).toBe(error);
  });
});
