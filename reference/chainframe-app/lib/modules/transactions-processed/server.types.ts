// src/lib/modules/transactions-processed/types.server.ts
import type { Document } from "mongoose";

export type ProcessedTxType =
  | "withdrawal"
  | "deposit"
  | "market_purchase"
  | "registration"
  | "shop_purchase"
  | "game_action";

export type ProcessedTxMetadata = {
  paymentOperationIndex?: number;
  referralPolicyVersion?: number;
  referralEligible?: boolean;
  referralObligation?: import("@/lib/modules/transactions-pending/server.types").ReferralObligation;
  treasuryTransfers?: import("@/lib/modules/transactions-pending/server.types").TreasuryTransfer[];
  marketFeePolicyVersion?: number;
  marketFeeObligation?: import("@/lib/modules/transactions-pending/server.types").MarketFeeObligation;
  marketFeeStatus?: "pending" | "paid" | "not_due";
} & (
  | {
      type: "game_action";
      event: import("@/lib/modules/transactions-pending/server.types").GameEventRecord;
    }
  | { type: "withdrawal"; payoutTxHash: string; reservationAccepted?: boolean }
  | { type: "deposit"; creditedAmount: number }
  | {
      type: "market_purchase";
      currency?: "HIVE" | "HASH";
      itemId: string;
      itemType: string;
      seller: string;
      price: number;
      fee: number;
    }
  | {
      type: "registration";
      registrationHiveAmount: number;
      /** Actual amount read off the verified Hive transfer. */
      registrationHiveAmountPaid: number;
      /** Recorded liquid HASH grant; never inferred for earlier records. */
      startingHash?: number;
      startingItems?: import("@/features/types/game/inventory").StartingItemAward[];
      registrationStarterPack?: import("@/lib/modules/transactions-pending/server.types").RegistrationStarterPack;
      registrationStarterItemsGranted?: import("@/features/types/game/inventory").StartingItemAward[];
    }
  | {
      type: "shop_purchase";
      shopKind: "chest" | "consumable";
      shopItemId: string;
      shopQuantity: number;
      shopHiveAmount: number;
      shopHiveAmountPaid: number;
    }
);

export type ProcessedTxOutcome = "success" | "failed";

/** Minimal server-side evidence used to approve aggregate log contributions. */
export interface AnalyticsReceipt {
  key: string;
  wallet: string;
  type: ProcessedTxType;
  action?: string;
  operationIndex?: number;
  itemId?: string;
  currency?: string;
  shopKind?: string;
}

export interface IProcessedTransaction extends Document {
  txHash: string; // unique idempotency key
  wallet: string;
  type: ProcessedTxType;
  amount: number; // negative for outflows, positive for inflows
  processedAt: number; // Unix ms
  /**
   * "success" for settled/refunded transfers, "failed" when the pending job
   * was dead-lettered (non-retryable error or max retries exhausted) and
   * removed from transactions-pending with no financial effect of its own —
   * this row is the permanent record that the attempt was made and failed.
   */
  status: ProcessedTxOutcome;
  error?: string;
  metadata?: ProcessedTxMetadata;
}
