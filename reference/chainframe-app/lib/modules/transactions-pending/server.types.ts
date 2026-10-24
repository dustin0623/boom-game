// src/lib/modules/transactions-pending/types.server.ts
import type { Document } from "mongoose";

export type InboundTxStatus = "pending" | "failed" | "dead" | "reconciliation";
export type PendingTxType =
  | "withdrawal"
  | "deposit"
  | "market_purchase"
  | "registration"
  | "shop_purchase"
  | "game_action";
export type ShopPurchaseKind = "chest" | "consumable";

/** Private immutable attribution captured only after exact incoming verification. */
export interface ReferralObligation {
  source: string;
  operationIndex: number;
  paymentType: "registration" | "shop_purchase";
  buyer: string;
  referrer: string | null;
  basisMilli: number;
  rewardMilli: number;
  accountAlias: "treasury";
  from: string;
  itemId?: string;
  quantity: number;
}

/** Private, immutable revenue routing for one verified marketplace reservation. */
export interface MarketFeeObligation {
  source: string;
  operationIndex: number;
  buyer: string;
  seller: string;
  itemId: string;
  priceMilli: number;
  feeMilli: number;
  proceedsMilli: number;
  accountAlias: "market";
  from: string;
  to: string;
}

export interface IInboundTransaction extends Document {
  dependencyKeys?: string[];
  financialWorkflowVersion?: number;
  /** New withdrawals choose one immutable transfer-or-issue payout. */
  withdrawalPayoutPolicyVersion?: number;
  financialPhase?: "prepared" | "reserved" | "rejected" | "refund";
  originEventKey?: string;
  financialReason?: string;
  /** Private guard against replaying an interrupted multi-document write sequence. */
  databaseEffectsStarted?: boolean;
  referralPolicyVersion?: number;
  referralObligation?: ReferralObligation;
  referralStatus?: "pending" | "paid" | "not_due";
  marketFeePolicyVersion?: number;
  marketFeeTreasuryAccount?: string;
  marketFeeObligation?: MarketFeeObligation;
  marketFeeStatus?: "pending" | "paid" | "not_due";
  treasuryTransfers?: TreasuryTransfer[];
  paymentOperationIndex?: number;
  eventTime?: number;
  randomSeed?: string;
  marketSettlement?: {
    currency: "HIVE";
    seller: string;
    price: number;
    fee: number;
    proceeds: number;
    name: string;
    rarity: string;
  };
  gameEvent?: import("@/lib/modules/transactions-pending/server.types").GameEventRecord;
  type: PendingTxType;
  signature: string; // idempotency key — operation identity for withdrawal, transaction ID for payments
  walletAddress: string; // payer / recipient

  withdrawAmount?: number;

  depositAmount?: number;
  depositTxId?: string;

  itemId?: string;
  itemType?: string;
  price?: number;
  paymentTxId?: string; // Native HIVE payment for new market purchases
  /** New marketplace jobs are native HIVE with an immutable receiving account. */
  paymentCurrency?: "HIVE";
  paymentAccount?: string;
  refunded?: boolean; // buyer was paid back through Hive

  /**
   * Fixed registration fee in HIVE (REGISTRATION_FEE_HIVE), recorded at enqueue
   * time. Populated only when type === "registration".
   */
  registrationHiveAmount?: number;
  registrationStarterPack?: RegistrationStarterPack;
  registrationStarterPackArchived?: boolean;
  registrationStarterItemsGranted?: import("@/features/types/game/inventory").StartingItemAward[];

  /** shop_purchase only: what the player is buying with HIVE. */
  shopKind?: ShopPurchaseKind;
  shopItemId?: string;
  shopQuantity?: number;
  /** Exact HIVE the player must have paid, locked server-side at enqueue time. */
  shopHiveAmount?: number;
  /** New shop jobs grant inventory stacks, never immediate equipment. */
  shopFulfillment?: "inventory";

  status: InboundTxStatus;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

import type { CustomJsonEvent } from "hivexph-sdk";
export type GameEventStatus =
  | "observed"
  | "queued"
  | "processed"
  | "rejected"
  | "failed"
  | "reconciliation";

export interface GameEventRecord {
  participants?: string[];
  waitingFor?: string[];
  stage?: import("@/features/types/game/raid-settlement").RaidStage;
  firstFailure?: { stage: string; code: "RAID_WRITE_UNCERTAIN" };
  raidSettlement?: import("@/features/types/game/raid-settlement").RaidSettlement;
  result?: unknown;
  randomSeed?: string;
  event?: CustomJsonEvent;
  nonce?: string;
  attempts?: number;
  claimUntil?: number;
  claimToken?: string;
  eventKey: string;
  transactionId: string;
  operationIndex: number;
  blockNumber: number;
  transactionIndex: number;
  eventId: string;
  actor: string;
  status: GameEventStatus;
  reason?: string;
  updatedAt: number;
}

export interface TreasuryIntent {
  /** Explicit on new withdrawal payouts; omitted on existing transfer paths. */
  operation?: "transfer" | "issue";
  accountAlias: "treasury" | "market";
  from: string;
  to: string;
  symbol: string;
  quantity: string;
  memo: string;
}
export interface TreasuryTransfer {
  key: string;
  intent: TreasuryIntent;
  state: "broadcasting" | "submitted" | "confirmed" | "failed";
  transactionId?: string;
  operationIndex?: number;
  blockNumber?: number;
  verifiedAt?: number;
  error?: string;
}

/** Private, write-once evidence captured before registration rewards start. */
export interface RegistrationStarterPack {
  version: 1;
  eventId: string;
  transactionId: string;
  wallet: string;
  operationIndex: number;
  blockNumber: number;
  paymentTime: number;
  startsAt: number;
  endsAt: number;
  items: import("@/features/types/game/inventory").StartingItemAward[];
}
