// src/lib/modules/transactions-pending/model.server.ts
import mongoose, { Schema, Model } from "mongoose";
import type { IInboundTransaction } from "./server.types";

const InboundTransactionSchema = new Schema<IInboundTransaction>(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "withdrawal",
        "deposit",
        "market_purchase",
        "registration",
        "shop_purchase",
        "game_action",
      ],
    },
    signature: { type: String, required: true, unique: true, index: true },
    paymentOperationIndex: Number,
    eventTime: Number,
    randomSeed: String,
    databaseEffectsStarted: Boolean,
    dependencyKeys: { type: [String], default: undefined },
    referralPolicyVersion: Number,
    referralObligation: { type: Schema.Types.Mixed },
    referralStatus: { type: String, enum: ["pending", "paid", "not_due"] },
    marketFeePolicyVersion: Number,
    marketFeeTreasuryAccount: String,
    marketFeeObligation: { type: Schema.Types.Mixed },
    marketFeeStatus: { type: String, enum: ["pending", "paid", "not_due"] },
    financialWorkflowVersion: Number,
    withdrawalPayoutPolicyVersion: Number,
    financialPhase: String,
    financialReason: String,
    originEventKey: String,
    gameEvent: { type: Schema.Types.Mixed },
    marketSettlement: { type: Schema.Types.Mixed },
    walletAddress: { type: String, required: true, index: true },

    withdrawAmount: Number,
    depositAmount: Number,
    depositTxId: String,

    itemId: String,
    itemType: String,
    price: Number,
    paymentTxId: String,
    paymentCurrency: { type: String, enum: ["HIVE"] },
    paymentAccount: String,
    refunded: { type: Boolean, default: false },
    treasuryTransfers: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            intent: {
              type: new Schema(
                {
                  operation: { type: String, enum: ["transfer", "issue"] },
                  accountAlias: {
                    type: String,
                    enum: ["treasury", "market"],
                    required: true,
                  },
                  from: { type: String, required: true },
                  to: { type: String, required: true },
                  symbol: { type: String, required: true },
                  quantity: { type: String, required: true },
                  memo: { type: String, required: true },
                },
                { _id: false },
              ),
              required: true,
            },
            state: {
              type: String,
              enum: ["broadcasting", "submitted", "confirmed", "failed"],
              required: true,
            },
            transactionId: String,
            operationIndex: Number,
            blockNumber: Number,
            verifiedAt: Number,
            error: String,
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },

    registrationHiveAmount: Number,
    registrationStarterPack: { type: Schema.Types.Mixed },
    registrationStarterPackArchived: Boolean,
    registrationStarterItemsGranted: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },

    shopKind: String,
    shopItemId: String,
    shopQuantity: Number,
    shopHiveAmount: Number,
    shopFulfillment: { type: String, enum: ["inventory"] },

    status: {
      type: String,
      required: true,
      enum: ["pending", "failed", "dead", "reconciliation"],
      default: "pending",
    },
    retryCount: { type: Number, default: 0 },
    lastError: String,
  },
  { collection: "transactions-pending", timestamps: true },
);

InboundTransactionSchema.index({ status: 1, createdAt: 1 });

export const InboundTransactionModel: Model<IInboundTransaction> =
  mongoose.models["InboundTransaction"] ??
  mongoose.model<IInboundTransaction>(
    "InboundTransaction",
    InboundTransactionSchema,
  );
