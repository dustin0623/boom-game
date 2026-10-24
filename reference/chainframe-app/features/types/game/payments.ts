import type { TransactionSession } from "@/features/stores/transactionStore";
export interface PaymentSessionContext {
  session: TransactionSession;
  isCurrent: () => boolean;
  onSubmitted?: () => void;
}
export interface SubmittedTransaction {
  id: string;
  session: string;
  kind: "game" | "payment";
  label: string;
  transactionId: string | null;
  operationIndex: number;
  submittedAt: number;
  status: "submitted" | "delayed" | "unknown";
  type: string;
  requireLog?: string;
  registered?: boolean;
  lock?: { key: string; token: string };
}
export type PaymentPhase =
  "idle" | "awaiting-keychain-approval" | "confirming-onchain";
export interface HiveShopOrder {
  kind: "chest" | "consumable";
  itemId: string;
  quantity: number;
  hiveAmount: number;
}
export type HiveShopOutcome =
  { ok: true } | { ok: false; error: string };
