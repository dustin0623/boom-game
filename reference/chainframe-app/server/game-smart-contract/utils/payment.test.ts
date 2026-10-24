import { describe, expect, it } from "vitest";
import { classifyPaymentObservation } from "./payment";

describe("payment observation classification", () => {
  it.each([
    [{ status: "pending", success: false, operationIndex: 9 }, 1, "pending"],
    [
      { status: "confirmed", success: true, operationIndex: 9 },
      1,
      "operation-mismatch",
    ],
    [
      { status: "failed", success: false, operationIndex: 9 },
      1,
      "operation-mismatch",
    ],
    [
      { status: "confirmed", success: false, operationIndex: 1 },
      1,
      "unconfirmed",
    ],
    [{ status: "failed", success: true, operationIndex: 1 }, 1, "unconfirmed"],
    [{ status: "confirmed", success: true, operationIndex: 1 }, 1, "confirmed"],
    [
      { status: "confirmed", success: true, operationIndex: 9 },
      undefined,
      "confirmed",
    ],
  ] as const)(
    "preserves pending and identity precedence",
    (verification, expectedIndex, outcome) => {
      expect(classifyPaymentObservation(verification, expectedIndex)).toBe(
        outcome,
      );
    },
  );
});
