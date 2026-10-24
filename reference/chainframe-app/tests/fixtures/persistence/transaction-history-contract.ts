import type { PendingTxDto, SettledTxDto } from "@/lib/api/types";
import type { HistoryOptions } from "@/lib/utils/logs/history";
export interface TransactionPage {
  pending: PendingTxDto[];
  history: SettledTxDto[];
  nextCursor: string | null;
  latestCursor: string | null;
}
export interface TransactionHistoryRepository {
  list(wallet: string, options: HistoryOptions): Promise<TransactionPage>;
}
export function publicTransactionMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  if (metadata.type === "game_action") {
    const event = metadata.event as {
      event?: { action?: string };
      transactionId?: string;
      operationIndex?: number;
      status?: string;
      reason?: string;
    };
    return {
      type: "game_action",
      action: event.event?.action,
      transactionId: event.transactionId,
      operationIndex: event.operationIndex,
      status: event.status,
      reason: event.reason ?? null,
    };
  }
  const keys = [
    "type",
    "paymentOperationIndex",
    "creditedAmount",
    "itemId",
    "itemType",
    "seller",
    "price",
    "fee",
    "payoutTxHash",
    "registrationHiveAmount",
    "registrationHiveAmountPaid",
  ];
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => keys.includes(key)),
  );
}
