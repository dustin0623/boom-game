/** Pure intake classification; callers retain their own memo, amount and rejection policy. */
export function classifyPaymentObservation(
  verification: { success: boolean; status: string; operationIndex?: number },
  expectedOperationIndex?: number,
): "pending" | "operation-mismatch" | "unconfirmed" | "confirmed" {
  if (verification.status === "pending") return "pending";
  if (
    expectedOperationIndex !== undefined &&
    verification.operationIndex !== expectedOperationIndex
  )
    return "operation-mismatch";
  if (!verification.success || verification.status !== "confirmed")
    return "unconfirmed";
  return "confirmed";
}
