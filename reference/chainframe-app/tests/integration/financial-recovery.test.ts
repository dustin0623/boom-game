vi.mock("@/lib/auth/session", () => ({
  requireSession: async (request: Request) => ({
    wallet: request.headers.get("x-test-wallet") ?? "alice",
    username: request.headers.get("x-test-wallet") ?? "alice",
  }),
}));
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { hiveClient } from "@/lib/chains/modules/hive/client";
const setup = await vi.hoisted(async () => {
  const { config } = await import("dotenv");
  const { randomUUID } = await import("node:crypto");
  const environment: Record<string, string> = {};
  config({
    path: [".env.local", ".env"],
    processEnv: environment,
    quiet: true,
  });
  return {
    uri: process.env.MONGODB_URI ?? environment.MONGODB_URI,
    name: "chainframe_test_" + randomUUID().replaceAll("-", ""),
    send: vi.fn(),
    verify: vi.fn(),
    inbound: vi.fn(),
    tokenState: vi.fn(),
  };
});
vi.mock("@/lib/config/config", async (original) => ({
  config: {
    ...(await original<typeof import("@/lib/config/config")>()).config,
    mongoUri: setup.uri ?? "",
    mongoDb: setup.name,
    blockchain: {
      treasuryAccount: "treasury",
      marketAccount: "market",
      token: "HASH",
      tokenPrecision: 3,
    },
  },
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/get-token-state/action",
  () => ({ getTokenState: setup.tokenState }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/send-token-operation/action",
  () => ({ sendTokenOperation: setup.send }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/transfer-token/action",
  () => ({ transferToken: setup.send }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/transfer-native/action",
  () => ({ transferNative: setup.send }),
);
vi.mock(
  "@/server/game-smart-contract/features/events/treasury/verify.server",
  () => ({
    verifyTreasuryTransfer: setup.verify,
  }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-token-payment/action",
  () => ({ verifyTokenPayment: setup.inbound }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-native-payment/action",
  () => ({ verifyNativePayment: setup.inbound }),
);
import {
  initializeContractDatabase,
  disconnectContractDatabase,
} from "@/server/game-smart-contract/utils/database.server";
import { PlayerModel } from "@/lib/modules/players/server.model";
import { EquipmentModel } from "@/lib/modules/equipments/server.model";
import { LogModel } from "@/lib/modules/logs/server.model";
import { InboundTransactionModel } from "@/lib/modules/transactions-pending/server.model";
import { ProcessedTransactionModel } from "@/lib/modules/transactions-processed/server.model";
import {
  upsertPlayer,
  reserveWithdrawal,
  getWithdrawalReservation,
  refundWithdrawalReservation,
  playerRepository,
} from "@/lib/modules/players/server.repository";
import {
  reserveMarketPurchase,
  equipItem,
  upgradeItem,
  salvageItem,
  cancelItemListing,
  listItemForSale,
  findListedEquipments,
} from "@/lib/modules/equipments/server.repository";
import {
  incrementSettlementStat,
  getStat,
} from "@/lib/modules/game-stats/server.repository";
import { requestWithdrawal } from "@/features/events/backend/request-withdrawal/action";
import { processJob } from "@/server/game-smart-contract/features/events/payment-processing/dispatch";
import {
  enqueueMarketPurchase,
  enqueueWithdrawal,
  setFinancialPhase,
  enqueueRegistration,
  enqueueShopPurchase,
  completeJob,
  captureMarketFeeObligation,
  finishMarketFeeObligation,
} from "@/lib/modules/transactions-pending/server.repository";
import { config } from "@/lib/config/config";

import { dispatchTreasuryOnce } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import { createGameActionProcessor } from "@/server/game-smart-contract/features/events/process-game-action/action";
import { createGameActionRegistry } from "@/server/game-smart-contract/features/events/process-game-action/dispatch";
import { hiveGameActionEvent } from "@/tests/fixtures/hive-game-action";
import { buildGameAction } from "@/lib/utils/game/action-protocol";
import { gameEventKey } from "@/lib/utils/game/event-identity.server";
import { GameStatModel } from "@/lib/modules/game-stats/server.model";
import { readInventory, readTransactions } from "@/tests/fixtures/api-reads";
import { getReferralHiveEarned } from "@/lib/modules/logs/server.repository";
import { getInventoryQuantity } from "@/lib/modules/items/server.repository";
import { reconcileTreasurySettlement } from "@/server/game-smart-contract/features/events/treasury/reconcile";
import { logger } from "@/lib/logger.server";
import { failMarketFeeWriteAfter } from "@/tests/fixtures/market-fee-faults";

const context = { checkLease: async () => {}, maxRetries: 8 };
async function queued(key: string) {
  const job = await InboundTransactionModel.findOne({ signature: key });
  if (!job) throw Error("Missing test job");
  return job;
}
function isolated() {
  if (
    mongoose.connection.db?.databaseName !== setup.name ||
    !/^chainframe_test_[a-f0-9]{32}$/.test(setup.name)
  )
    throw Error("Refusing operational database cleanup");
  return mongoose.connection.db;
}
async function marketItem() {
  return EquipmentModel.create({
    owner: "seller",
    templateId: 1000,
    name: "Rig",
    slot: "asicMiner",
    rarity: "common",
    market: { price: 5, currency: "HIVE", listedAt: 100, isMarket: true },
  });
}
async function marketJob(id: string, price = 5, feeTreasuryAccount = "treasury") {
  await enqueueMarketPurchase({
    feeTreasuryAccount,
    paymentCurrency: "HIVE",
    paymentAccount: "market",
    walletAddress: "alice",
    itemId: id,
    itemType: "asicMiner",
    price,
    paymentTxId: "purchase",
    paymentOperationIndex: 0,
  });
  setup.inbound.mockResolvedValue({
    success: true,
    status: "confirmed",
    operationIndex: 0,
    transactionId: "purchase",
    symbol: "HIVE",
    from: "alice",
    to: "market",
    amount: String(price),
    trigger: { action: "market_purchase", metadata: { itemId: id } },
  });
  return queued("purchase");
}

async function feePurchase(price = 0.1, treasury = "treasury") {
  const item = await marketItem();
  await EquipmentModel.updateOne({ _id: item._id }, { $set: { "market.price": price } });
  await marketJob(String(item._id), price, treasury);
  setup.send.mockImplementation(async ({ account }) => ({ success: true, transactionId: account === "seller" ? "seller-tx" : "fee-tx" }));
  return String(item._id);
}

async function referredPurchase(itemId = "equipment", quantity = 1) {
  await upsertPlayer({ wallet: "referrer", username: "referrer" });
  await PlayerModel.updateOne(
    { wallet: "alice" },
    { $set: { referredBy: "referrer" } },
  );
  const kind = itemId === "equipment" ? "chest" : "consumable";
  const amount = (kind === "chest" ? 10 : 0.1) * quantity;
  await enqueueShopPurchase({
    walletAddress: "alice",
    paymentTxId: "shop",
    paymentOperationIndex: 0,
    shopKind: kind,
    shopItemId: itemId,
    shopQuantity: quantity,
    shopHiveAmount: amount,
  });
  setup.inbound.mockResolvedValue({
    success: true,
    status: "confirmed",
    operationIndex: 0,
    transactionId: "shop",
    symbol: "HIVE",
    from: "alice",
    to: "treasury",
    amount: String(amount),
    trigger: { action: "shop_purchase", metadata: { kind, itemId, quantity } },
  });
  return queued("shop");
}
describe.skipIf(!setup.uri)("standalone financial recovery", () => {
  beforeAll(async () => {
    await initializeContractDatabase();
    isolated();
  }, 60000);
  beforeEach(async () => {
    vi.restoreAllMocks();
    Object.assign(config.blockchain, { treasuryAccount: "treasury", marketAccount: "market" });
    vi.spyOn(hiveClient, "resolveAccount").mockImplementation(
      (alias) => ({ account: alias }) as never,
    );
    isolated();
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    setup.send.mockReset();
    setup.verify.mockReset();
    setup.inbound.mockReset();
    setup.tokenState.mockReset();
    setup.tokenState.mockResolvedValue({ balance: "100.000", issuer: "treasury", precision: 3, supply: "100.000", maxSupply: "1000.000" });
    setup.send.mockResolvedValue({ success: true, transactionId: "payout" });
    setup.verify.mockResolvedValue({
      status: "confirmed",
      evidence: { state: "confirmed", operationIndex: 0, blockNumber: 100 },
    });
    await upsertPlayer({ wallet: "alice", username: "alice" });
    await PlayerModel.updateOne(
      { wallet: "alice" },
      { $set: { hash: 100, isRegistered: true } },
    );
  });
  afterAll(async () => {
    if (mongoose.connection.readyState === 1) await isolated().dropDatabase();
    await disconnectContractDatabase();
  });
  it("credits HASH and its referral counter in one atomic update", async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        playerRepository.creditReferralHash("alice", 0.05),
      ),
    );
    const player = await PlayerModel.findOne({ wallet: "alice" }).lean();
    expect(player?.hash).toBeCloseTo(101, 10);
    expect(player?.referralEarned).toBeCloseTo(1, 10);
    await expect(
      playerRepository.creditReferralHash("missing", 1),
    ).rejects.toThrow("Referrer not found");
    expect(await PlayerModel.exists({ wallet: "missing" })).toBeNull();
  });
  it.each([
    ["equipment", 2, "1.000"],
    ["help-kit", 1, "0.005"],
    ["sabotage-device", 1, "0.005"],
  ])(
    "fulfills %s and pays the referrer in HIVE only",
    async (itemId, quantity, payout) => {
      const job = await referredPurchase(String(itemId), Number(quantity));
      await processJob(context, job);
      expect(
        await getInventoryQuantity("alice", String(itemId) as "equipment"),
      ).toBe(quantity);
      expect(setup.send).toHaveBeenCalledOnce();
      expect(setup.send).toHaveBeenCalledWith(
        expect.objectContaining({
          account: "referrer",
          amount: payout,
          symbol: "HIVE",
          action: "refund",
          metadata: { memo: "Chainframe referral shop shop" },
        }),
      );
      expect(
        await PlayerModel.findOne({ wallet: "referrer" }).lean(),
      ).toMatchObject({ hash: 0, referralEarned: 0 });
      expect(await getReferralHiveEarned("referrer")).toBe(Number(payout));
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "shop" }).lean(),
      ).toMatchObject({
        status: "success",
        metadata: {
          treasuryTransfers: [expect.objectContaining({ state: "confirmed" })],
        },
      });
      await processJob(context, job);
      expect(setup.send).toHaveBeenCalledOnce();
      expect(await LogModel.countDocuments({ type: "referral" })).toBe(1);
    },
  );
  it("confirms the buyer while a referral is pending, retaining immutable attribution and no failure retries", async () => {
    const job = await referredPurchase();
    setup.verify.mockResolvedValue({ status: "pending" });
    await processJob(context, job);
    expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
    expect((await queued("shop")).databaseEffectsStarted).not.toBe(true);
    expect(await queued("shop")).toMatchObject({
      referralStatus: "pending",
      retryCount: 0,
      referralObligation: {
        referrer: "referrer",
        basisMilli: 10000,
        rewardMilli: 500,
        from: "treasury",
      },
    });
    await expect(completeJob(String(job._id))).rejects.toThrow("uncertain");
    const history = await readTransactions("alice", { limit: 100 });
    expect(history.pending).toEqual([]);
    expect(history.history[0]).toMatchObject({
      status: "success",
      txHash: "shop",
    });
    expect(await getReferralHiveEarned("referrer")).toBe(0);
    for (const field of [
      "referralObligation",
      "referralEligible",
      "referralPolicyVersion",
      "treasuryTransfers",
    ])
      expect(JSON.stringify(history)).not.toContain(field);
    await PlayerModel.updateOne(
      { wallet: "alice" },
      { $set: { referredBy: "changed" } },
    );
    setup.verify.mockResolvedValue({
      status: "confirmed",
      evidence: { state: "confirmed", operationIndex: 0, blockNumber: 100 },
    });
    await processJob(context, await queued("shop"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
    expect(await getReferralHiveEarned("referrer")).toBe(0.5);
  });
  it.each(["missing-id", "exception", "failed", "routing"])(
    "parks %s referral payouts without reversing the completed purchase",
    async (failure) => {
      const parked = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const job = await referredPurchase();
      if (failure === "missing-id")
        setup.send.mockResolvedValue({ success: true });
      if (failure === "exception")
        setup.send.mockRejectedValue(Error("unknown broadcast"));
      if (failure === "failed")
        setup.verify.mockResolvedValue({
          status: "failed",
          evidence: { state: "failed", operationIndex: 0, blockNumber: 100 },
        });
      if (failure === "routing")
        setup.verify.mockResolvedValue({ status: "pending" });
      await processJob(context, job);
      if (failure === "routing")
        await InboundTransactionModel.updateOne(
          { signature: "shop" },
          { $set: { "referralObligation.from": "changed" } },
        );
      await processJob(context, await queued("shop"));
      expect(setup.send).toHaveBeenCalledOnce();
      expect(await queued("shop")).toMatchObject({ status: "reconciliation" });
      expect(parked).toHaveBeenCalledWith("payment job parked for reconciliation", {
        signature: "shop", type: "shop_purchase", stage: "settlement",
        code: failure === "failed" ? "TRANSFER_FAILED" : "SETTLEMENT_UNCERTAIN",
      });
      expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
      expect(await getReferralHiveEarned("referrer")).toBe(0);
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "shop" }).lean(),
      ).toMatchObject({ status: "success" });
      expect(
        await ProcessedTransactionModel.exists({ txHash: "refund:shop" }),
      ).toBeNull();
    },
  );
  it("pays registration once after activation and retains the 10 HASH starter award", async () => {
    await referredPurchase();
    await InboundTransactionModel.deleteOne({ signature: "shop" });
    await PlayerModel.updateOne(
      { wallet: "alice" },
      { $set: { isRegistered: false, hash: 3.5 } },
    );
    await enqueueRegistration({
      walletAddress: "alice",
      depositTxId: "registration",
      registrationHiveAmount: 150,
      paymentOperationIndex: 0,
    });
    setup.inbound.mockResolvedValue({
      success: true,
      status: "confirmed",
      operationIndex: 0,
      from: "alice",
      to: "treasury",
      amount: "150.000",
      symbol: "HIVE",
      transactionId: "registration",
      blockNumber: 100, blockTimestamp: "2026-10-18T12:00:00",
      trigger: { action: "registration", metadata: {} },
    });
    const job = await queued("registration");
    await processJob(context, job);
    expect(await PlayerModel.findOne({ wallet: "alice" }).lean()).toMatchObject(
      { hash: 13.5, isRegistered: true, xp: 0 },
    );
    expect(await getReferralHiveEarned("referrer")).toBe(7.5);
    expect(setup.send).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: "7.500",
        account: "referrer",
        metadata: { memo: "Chainframe referral registration registration" },
      }),
    );
    await processJob(context, job);
    expect(setup.send).toHaveBeenCalledOnce();
    await enqueueRegistration({
      walletAddress: "alice",
      depositTxId: "duplicate",
      registrationHiveAmount: 150,
      paymentOperationIndex: 0,
    });
    await processJob(context, await queued("duplicate"));
    expect(setup.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: "150.000", account: "alice" }),
    );
    expect(await getReferralHiveEarned("referrer")).toBe(7.5);
  });
  it("reconciles a missing broadcast ID without broadcasting twice or fulfilling again", async () => {
    const job = await referredPurchase();
    setup.send.mockResolvedValue({ success: true });
    await processJob(context, job);
    await reconcileTreasurySettlement(
      "shop",
      "referral:shop",
      "operator-proven-payout",
    );
    await processJob(context, await queued("shop"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
    expect(await getReferralHiveEarned("referrer")).toBe(0.5);
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
  });
  it("awards one registration referral and refunds the competing verified fee", async () => {
    await referredPurchase();
    await InboundTransactionModel.deleteOne({ signature: "shop" });
    await PlayerModel.updateOne({ wallet: "alice" }, { $set: { isRegistered: false, hash: 3.5 } });
    for (const txId of ["registration-a", "registration-b"])
      await enqueueRegistration({ walletAddress: "alice", depositTxId: txId, registrationHiveAmount: 150, paymentOperationIndex: 0 });
    setup.inbound.mockImplementation(async ({ transactionId }: { transactionId: string }) => ({
      success: true, status: "confirmed", operationIndex: 0, transactionId,
      from: "alice", to: "treasury", amount: "150.000", symbol: "HIVE",
      blockNumber: 100, blockTimestamp: "2026-10-18T12:00:00",
      trigger: { action: "registration", metadata: {} },
    }));
    setup.send.mockImplementation(async () => ({ success: true, transactionId: `payout-${setup.send.mock.calls.length}` }));
    await Promise.all([processJob(context, await queued("registration-a")), processJob(context, await queued("registration-b"))]);
    expect(await PlayerModel.findOne({ wallet: "alice" }).lean()).toMatchObject({ hash: 13.5, isRegistered: true });
    expect(await getReferralHiveEarned("referrer")).toBe(7.5);
    expect(setup.send).toHaveBeenCalledTimes(2);
    expect(setup.send).toHaveBeenCalledWith(expect.objectContaining({ account: "alice", amount: "150.000" }));
    expect(await LogModel.countDocuments({ type: "referral" })).toBe(1);
    expect(await InboundTransactionModel.find({}, { signature: 1, status: 1, lastError: 1 }).lean()).toEqual([]);
  });
  it.each([
    "capture",
    "source-receipt",
    "verification",
    "log",
    "paid-marker",
    "archive",
    "cleanup",
  ])(
    "preserves source authority and recovers keyed referral writes after %s",
    async (stage) => {
      await referredPurchase();
      const target =
        stage === "source-receipt" || stage === "archive"
          ? ProcessedTransactionModel
          : stage === "log"
            ? LogModel
            : InboundTransactionModel;
      const method =
        stage === "source-receipt"
          ? "create"
          : stage === "log"
            ? "findOneAndUpdate"
            : stage === "cleanup"
              ? "deleteOne"
              : "updateOne";
      const original = target[method];
      let injected = false;
      vi.spyOn(target, method).mockImplementation((async (
        ...args: unknown[]
      ) => {
        const query = args[0] as Record<string, unknown>;
        const update = args[1] as
          { $set?: Record<string, unknown> } | undefined;
        const matches =
          stage === "capture"
            ? !!update?.$set?.referralObligation
            : stage === "source-receipt"
              ? query.txHash === "shop"
              : stage === "verification"
                ? !!update?.$set?.["treasuryTransfers.$.verifiedAt"]
                : stage === "log"
                  ? query.settlementKey === "referral:shop"
                  : stage === "paid-marker"
                    ? update?.$set?.referralStatus === "paid"
                    : stage === "archive"
                      ? !!update?.$set?.["metadata.treasuryTransfers"]
                      : true;
        const crash = matches && !injected;
        if (crash) injected = true;
        const result = await Reflect.apply(original, target, args);
        if (crash) throw Error("lost acknowledgement after " + stage);
        return result;
      }) as never);
      await processJob(context, await queued("shop"));
      expect(injected).toBe(true);
      const pending = await InboundTransactionModel.findOne({
        signature: "shop",
      });
      if (pending) await processJob(context, pending);
      expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "shop" }).lean(),
      ).toMatchObject({ status: "success" });
      if (stage === "source-receipt") {
        // A receipt cannot bypass the unfinished ordinary effects fence.
        expect(await queued("shop")).toMatchObject({
          status: "reconciliation",
          databaseEffectsStarted: true,
        });
        expect(setup.send).not.toHaveBeenCalled();
        expect(await getReferralHiveEarned("referrer")).toBe(0);
      } else {
        expect(setup.send).toHaveBeenCalledOnce();
        expect(await getReferralHiveEarned("referrer")).toBe(0.5);
        expect(await LogModel.countDocuments({ type: "referral" })).toBe(1);
        expect(await InboundTransactionModel.countDocuments()).toBe(0);
      }
    },
  );
  it("coalesces competing payout claims and keyed earnings without repeating stock grants", async () => {
    await referredPurchase();
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("shop"));
    await Promise.all([
      processJob(context, await queued("shop")),
      processJob(context, await queued("shop")),
    ]);
    expect(setup.send).toHaveBeenCalledOnce();
    expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
    expect(await getReferralHiveEarned("referrer")).toBe(0.5);
    expect(await LogModel.countDocuments({ type: "referral" })).toBe(1);
  });
  it("excludes historical HASH, unkeyed, unpaid and unrelated rewards from HIVE earnings", async () => {
    await LogModel.create([
      { type: "referral", wallet: "referrer", amount: 10, data: {} },
      {
        type: "referral",
        wallet: "referrer",
        amount: 20,
        data: { currency: "HIVE", paid: true },
      },
      {
        type: "referral",
        wallet: "referrer",
        amount: 30,
        settlementKey: "unpaid",
        data: { currency: "HIVE" },
      },
      {
        type: "referral",
        wallet: "other",
        amount: 40,
        settlementKey: "other",
        data: { currency: "HIVE", paid: true },
      },
    ]);
    expect(await getReferralHiveEarned("referrer")).toBe(0);
  });
  it.each([null, "alice", "missing"])(
    "records no payable obligation for absent or invalid referrer %s",
    async (referrer) => {
      const job = await referredPurchase();
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { referredBy: referrer } },
      );
      await processJob(context, job);
      expect(setup.send).not.toHaveBeenCalled();
      expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
      expect(await LogModel.countDocuments({ type: "referral" })).toBe(0);
    },
  );
  it("parks old unsupported policy evidence without touching inventory or payments", async () => {
    await referredPurchase();
    await InboundTransactionModel.updateOne(
      { signature: "shop" },
      { $unset: { referralPolicyVersion: 1 } },
    );
    await processJob(context, await queued("shop"));
    expect(await queued("shop")).toMatchObject({ status: "reconciliation" });
    expect(await getInventoryQuantity("alice", "equipment")).toBe(0);
    expect(setup.send).not.toHaveBeenCalled();
  });
  it("rejects capacity and balance atomically, without spending HASH", async () => {
    expect(
      (await reserveWithdrawal("alice", "over-cap", 11, 10, Date.now())).ok,
    ).toBe(false);
    expect(
      (await reserveWithdrawal("alice", "over-balance", 101, 1000, Date.now()))
        .ok,
    ).toBe(false);
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      100,
    );
  });
  it("creates marketplace recovery evidence at intake and parks unsupported versions", async () => {
    const item = await marketItem();
    await marketJob(String(item._id));
    const job = await queued("purchase");
    expect(job.financialWorkflowVersion).toBe(1);
    await InboundTransactionModel.updateOne(
      { signature: "purchase" },
      { $unset: { financialWorkflowVersion: "" } },
    );
    await processJob(context, await queued("purchase"));
    expect((await queued("purchase")).status).toBe("reconciliation");
    expect((await EquipmentModel.findById(item._id).lean())?.owner).toBe(
      "seller",
    );
    expect(setup.send).not.toHaveBeenCalled();
  });
  it("requires withdrawal operation identities and refuses unsupported phase transitions", async () => {
    await expect(
      enqueueWithdrawal({
        walletAddress: "alice",
        withdrawAmount: 5,
      } as Parameters<typeof enqueueWithdrawal>[0]),
    ).rejects.toThrow("Missing withdrawal operation identity");
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
    await enqueueWithdrawal({
      signature: "withdrawal:origin",
      originEventKey: "origin",
      walletAddress: "alice",
      withdrawAmount: 5,
    });
    expect(await queued("withdrawal:origin")).toMatchObject({
      financialWorkflowVersion: 1,
      financialPhase: "prepared",
      originEventKey: "origin",
    });
    await InboundTransactionModel.updateOne(
      { signature: "withdrawal:origin" },
      { $unset: { financialPhase: "" } },
    );
    await expect(
      setFinancialPhase("withdrawal:origin", "reserved"),
    ).rejects.toThrow("Financial phase changed");
    await expect(
      requestWithdrawal("alice", 5, "withdrawal:origin"),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: "Withdrawal job intent changed",
      }),
    });
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      100,
    );
    expect(setup.send).not.toHaveBeenCalled();
  });
  it("refuses to broadcast a prepared withdrawal without reservation activation", async () => {
    await enqueueWithdrawal({
      signature: "withdrawal:origin",
      originEventKey: "origin",
      walletAddress: "alice",
      withdrawAmount: 5,
    });
    await expect(
      dispatchTreasuryOnce(
        "withdrawal:origin",
        "payout",
        {
          accountAlias: "treasury",
          from: "treasury",
          to: "alice",
          quantity: "5.000",
          symbol: "HASH",
          memo: "test",
        },
        setup.send,
      ),
    ).rejects.toThrow("reconciliation");
    expect(setup.send).not.toHaveBeenCalled();
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      100,
    );
  });
  it("reserves once under concurrency and prevents capacity overspend", async () => {
    const now = Date.now();
    const result = await Promise.all([
      reserveWithdrawal("alice", "one", 7, 10, now),
      reserveWithdrawal("alice", "two", 7, 10, now),
    ]);
    expect(result.filter((r) => r.ok)).toHaveLength(1);
    const key = result[0].ok ? "one" : "two";
    expect((await reserveWithdrawal("alice", key, 7, 10, now)).ok).toBe(true);
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      93,
    );
    await expect(reserveWithdrawal("alice", key, 8, 10, now)).rejects.toThrow(
      "intent changed",
    );
  });
  it("compensates once without subtracting capacity from a later window", async () => {
    const now = Date.now();
    await reserveWithdrawal("alice", "old", 5, 10, now);
    await reserveWithdrawal("alice", "new", 4, 10, now + 86_400_001);
    await Promise.all([
      refundWithdrawalReservation("alice", "old"),
      refundWithdrawalReservation("alice", "old"),
    ]);
    expect(await PlayerModel.findOne({ wallet: "alice" }).lean()).toMatchObject(
      { hash: 96, withdrawnToday: 4 },
    );
  });
  it("recovers activation failure without another debit or payout", async () => {
    const original = InboundTransactionModel.updateOne.bind(
      InboundTransactionModel,
    );
    let interrupted = false;
    vi.spyOn(InboundTransactionModel, "updateOne").mockImplementation(((
      query,
      update,
      ...rest
    ) => {
      if (
        !interrupted &&
        (update as { $set?: { financialPhase?: string } }).$set
          ?.financialPhase === "reserved"
      ) {
        interrupted = true;
        throw Error("activation failed");
      }
      return Reflect.apply(original, InboundTransactionModel, [
        query,
        update,
        ...rest,
      ]);
    }) as typeof InboundTransactionModel.updateOne);
    await expect(
      requestWithdrawal("alice", 5, "withdrawal:origin"),
    ).rejects.toThrow("Database writes did not finish");
    expect(
      (await getWithdrawalReservation("alice", "withdrawal:origin"))?.amount,
    ).toBe(5);
    await processJob(context, await queued("withdrawal:origin"));
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      95,
    );
    expect(
      await ProcessedTransactionModel.findOne({
        txHash: "withdrawal:origin",
      }).lean(),
    ).toMatchObject({ amount: -5 });
    expect(setup.send).toHaveBeenCalledOnce();
  });
  it("finishes an interrupted request receipt from its existing reservation", async () => {
    const event = hiveGameActionEvent(
      buildGameAction("request_withdrawal", {
        amount: 5,
        nonce: "withdrawal-test-123456",
      }),
    );
    const processor = createGameActionProcessor(createGameActionRegistry());
    vi.spyOn(ProcessedTransactionModel, "create").mockRejectedValueOnce(
      Error("request receipt unavailable"),
    );
    await expect(processor.process(event)).rejects.toThrow();
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      95,
    );
    expect(await processor.process(event)).toMatchObject({
      status: "executed",
    });
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      95,
    );
    expect(
      await InboundTransactionModel.countDocuments({ type: "withdrawal" }),
    ).toBe(1);
    expect(
      await ProcessedTransactionModel.findOne({
        txHash: gameEventKey(event),
      }).lean(),
    ).toMatchObject({ status: "success" });
    expect(setup.send).not.toHaveBeenCalled();
  });
  it("preserves rejection after an interrupted request even when funds later increase", async () => {
    await PlayerModel.updateOne({ wallet: "alice" }, { $set: { hash: 1 } });
    const event = hiveGameActionEvent(
      buildGameAction("request_withdrawal", {
        amount: 5,
        nonce: "rejected-withdrawal-123456",
      }),
    );
    const processor = createGameActionProcessor(createGameActionRegistry());
    vi.spyOn(ProcessedTransactionModel, "create").mockRejectedValueOnce(
      Error("rejection receipt unavailable"),
    );
    await expect(processor.process(event)).rejects.toThrow();
    await PlayerModel.updateOne({ wallet: "alice" }, { $set: { hash: 100 } });
    await InboundTransactionModel.updateOne(
      { signature: gameEventKey(event) },
      { $set: { "gameEvent.claimUntil": 1 } },
    );
    expect(await processor.process(event)).toMatchObject({
      status: "rejected",
    });
    expect((await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash).toBe(
      100,
    );
    expect(
      await getWithdrawalReservation(
        "alice",
        "withdrawal:" + gameEventKey(event),
      ),
    ).toBeUndefined();
    expect(setup.send).not.toHaveBeenCalled();
  });
  it("waits for execution and refunds a proven failed withdrawal once", async () => {
    await requestWithdrawal("alice", 5, "withdrawal:origin");
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("withdrawal:origin"));
    expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
    setup.verify.mockResolvedValue({
      status: "failed",
      evidence: {
        state: "failed",
        blockNumber: 100,
        operationIndex: 0,
        error: "insufficient balance",
      },
    });
    await processJob(context, await queued("withdrawal:origin"));
    expect(await PlayerModel.findOne({ wallet: "alice" }).lean()).toMatchObject(
      { hash: 100, withdrawnToday: 0 },
    );
    expect(setup.send).toHaveBeenCalledOnce();
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
  });
  it.each([
    ["10.000", "transfer"],
    ["3.000", "issue"],
    ["0", "issue"],
  ])(
    "settles a full withdrawal with treasury balance %s using %s",
    async (balance, operation) => {
      setup.tokenState.mockResolvedValue({
        balance,
        issuer: "treasury",
        precision: 3,
        supply: "100",
        maxSupply: "1000",
      });
      await requestWithdrawal("alice", 10, "withdrawal:liquidity");
      expect(await queued("withdrawal:liquidity")).toMatchObject({
        financialWorkflowVersion: 1,
        withdrawalPayoutPolicyVersion: 1,
      });
      await processJob(context, await queued("withdrawal:liquidity"));
      expect(setup.send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          operation,
          quantity: "10.000",
          account: "alice",
          symbol: "HASH",
          memo: '{"action":"withdrawal","metadata":{"memo":"Chainframe withdrawal withdrawal:liquidity"}}',
        }),
      );
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 90, withdrawnToday: 10 });
      const receipt = await ProcessedTransactionModel.findOne({
        txHash: "withdrawal:liquidity",
      }).lean();
      expect(receipt).toMatchObject({
        amount: -10,
        metadata: {
          treasuryTransfers: [
            expect.objectContaining({
              intent: expect.objectContaining({ operation }),
              state: "confirmed",
            }),
          ],
        },
      });
      expect(
        await getWithdrawalReservation("alice", "withdrawal:liquidity"),
      ).toBeUndefined();
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      await requestWithdrawal("alice", 10, "withdrawal:liquidity");
      expect(setup.send).toHaveBeenCalledOnce();
      const publicHistory = JSON.stringify(
        await readTransactions("alice", { limit: 100 }),
      );
      expect(publicHistory).not.toContain("withdrawalPayoutPolicyVersion");
      expect(publicHistory).not.toContain("treasuryTransfers");
    },
  );
  it("reuses a pending mint after restart without checking replenished liquidity", async () => {
    setup.tokenState.mockResolvedValue({
      balance: "3.000",
      issuer: "treasury",
      precision: 3,
      supply: "100",
      maxSupply: "1000",
    });
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await requestWithdrawal("alice", 10, "withdrawal:restart");
    await processJob(context, await queued("withdrawal:restart"));
    expect(await queued("withdrawal:restart")).toMatchObject({
      treasuryTransfers: [
        expect.objectContaining({
          intent: expect.objectContaining({ operation: "issue" }),
          state: "submitted",
        }),
      ],
    });
    setup.tokenState.mockRejectedValue(Error("balance must not be read again"));
    await processJob(context, await queued("withdrawal:restart"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(setup.tokenState).toHaveBeenCalledOnce();
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
  });
  it.each(["0", "100"])(
    "restores a proven failed payout once, without selecting a replacement (balance %s)",
    async (balance) => {
      setup.tokenState.mockResolvedValue({
        balance,
        issuer: "treasury",
        precision: 3,
        supply: "100",
        maxSupply: "1000",
      });
      setup.verify.mockResolvedValue({
        status: "failed",
        evidence: { state: "failed", blockNumber: 100, operationIndex: 0 },
      });
      await requestWithdrawal("alice", 10, "withdrawal:failure");
      await processJob(context, await queued("withdrawal:failure"));
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 100, withdrawnToday: 0 });
      expect(setup.send).toHaveBeenCalledOnce();
      expect(setup.send.mock.calls[0][0].operation).toBe(
        balance === "0" ? "issue" : "transfer",
      );
      await requestWithdrawal("alice", 10, "withdrawal:failure");
      expect(setup.send).toHaveBeenCalledOnce();
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 100 });
    },
  );
  it("parks a missing mint ID without a second send, new balance read or compensation", async () => {
    setup.tokenState.mockResolvedValue({
      balance: "0",
      issuer: "treasury",
      precision: 3,
      supply: "100",
      maxSupply: "1000",
    });
    setup.send.mockResolvedValue({ success: true });
    await requestWithdrawal("alice", 10, "withdrawal:unknown");
    await processJob(context, await queued("withdrawal:unknown"));
    await processJob(context, await queued("withdrawal:unknown"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(setup.tokenState).toHaveBeenCalledOnce();
    expect(await queued("withdrawal:unknown")).toMatchObject({
      status: "reconciliation",
      treasuryTransfers: [
        expect.objectContaining({
          state: "broadcasting",
          intent: expect.objectContaining({ operation: "issue" }),
        }),
      ],
    });
    expect(await PlayerModel.findOne({ wallet: "alice" }).lean()).toMatchObject(
      { hash: 90, withdrawnToday: 10 },
    );
  });
  it("keeps supported legacy jobs transfer-only without adding policy or operation fields", async () => {
    await requestWithdrawal("alice", 10, "withdrawal:legacy");
    await InboundTransactionModel.updateOne(
      { signature: "withdrawal:legacy" },
      { $unset: { withdrawalPayoutPolicyVersion: "" } },
    );
    await requestWithdrawal("alice", 10, "withdrawal:legacy");
    await processJob(context, await queued("withdrawal:legacy"));
    expect(setup.tokenState).not.toHaveBeenCalled();
    expect(setup.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: "withdrawal", quantity: "10.000" }),
    );
    const receipt = await ProcessedTransactionModel.findOne({
      txHash: "withdrawal:legacy",
    }).lean();
    expect(
      receipt?.metadata?.treasuryTransfers?.[0].intent.operation,
    ).toBeUndefined();
  });
  it("retains the reserved balance when token-state evidence is unavailable", async () => {
    setup.tokenState.mockRejectedValue(Error("unavailable"));
    await requestWithdrawal("alice", 10, "withdrawal:no-state");
    await processJob(context, await queued("withdrawal:no-state"));
    expect(setup.send).not.toHaveBeenCalled();
    expect(await PlayerModel.findOne({ wallet: "alice" }).lean()).toMatchObject(
      { hash: 90 },
    );
    expect(await queued("withdrawal:no-state")).toMatchObject({
      status: "reconciliation",
    });
  });
  it("gives one buyer the reservation and blocks all item mutations", async () => {
    const item = await marketItem();
    const r = {
      key: "one",
      buyer: "alice",
      currency: "HIVE" as const,
      seller: "seller",
      price: 5,
      fee: 0,
      proceeds: 5,
      name: "Rig",
      rarity: "common",
      listedAt: 100,
      state: "reserved" as const,
    };
    const result = await Promise.all([
      reserveMarketPurchase(String(item._id), r),
      reserveMarketPurchase(String(item._id), {
        ...r,
        key: "two",
        buyer: "bob",
      }),
    ]);
    expect(result.filter(Boolean)).toHaveLength(1);
    for (const action of [
      equipItem,
      upgradeItem,
      salvageItem,
      cancelItemListing,
    ])
      expect((await action(String(item._id), "seller")).ok).toBe(false);
    expect((await listItemForSale(String(item._id), "seller", 6)).ok).toBe(
      false,
    );
  });
  it("hides legacy HASH listings and permits explicit HIVE relisting or cancellation", async () => {
    const legacy = await marketItem();
    await EquipmentModel.updateOne(
      { _id: legacy._id },
      { $unset: { "market.currency": 1 } },
    );
    expect(await findListedEquipments()).toEqual([]);
    expect(
      (await listItemForSale(String(legacy._id), "seller", 0.101)).ok,
    ).toBe(true);
    expect(await findListedEquipments()).toMatchObject([
      { market: { price: 0.101, currency: "HIVE" } },
    ]);
    expect((await cancelItemListing(String(legacy._id), "seller")).ok).toBe(
      true,
    );
    expect(await findListedEquipments()).toEqual([]);
  });
  it("parks legacy jobs without converting price or mutating protected ownership", async () => {
    const item = await marketItem();
    await marketJob(String(item._id));
    await InboundTransactionModel.updateOne(
      { signature: "purchase" },
      { $unset: { paymentCurrency: 1, paymentAccount: 1 } },
    );
    await processJob(context, await queued("purchase"));
    expect(setup.send).not.toHaveBeenCalled();
    expect((await EquipmentModel.findById(item._id).lean())?.owner).toBe(
      "seller",
    );
    expect((await queued("purchase")).status).toBe("reconciliation");
  });
  it("pays exactly 0.095 native HIVE for a 0.100 listing and keeps routing private", async () => {
    const item = await marketItem();
    await EquipmentModel.updateOne(
      { _id: item._id },
      { $set: { "market.price": 0.1 } },
    );
    const job = await marketJob(String(item._id));
    await InboundTransactionModel.updateOne(
      { _id: job._id },
      { $set: { price: 0.1 } },
    );
    setup.inbound.mockResolvedValue({
      success: true,
      status: "confirmed",
      operationIndex: 0,
      transactionId: "purchase",
      symbol: "HIVE",
      from: "alice",
      to: "market",
      amount: "0.100",
      trigger: {
        action: "market_purchase",
        metadata: { itemId: String(item._id) },
      },
    });
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        from: expect.objectContaining({ alias: "market", signing: true }),
        account: "seller",
        amount: "0.095",
        symbol: "HIVE",
      }),
    );
    expect(setup.send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      from: expect.objectContaining({ alias: "market", signing: true }), account: "treasury", amount: "0.005",
      symbol: "HIVE", action: "withdrawal", metadata: { memo: "Chainframe marketplace fee purchase" },
    }));
    expect(setup.send).toHaveBeenCalledTimes(2);
    const receipt = await ProcessedTransactionModel.findOne({
      txHash: "purchase",
    }).lean();
    expect(receipt?.metadata).toMatchObject({
      currency: "HIVE",
      price: 0.1,
      fee: 0.005,
      marketFeePolicyVersion: 1,
      marketFeeStatus: "paid",
    });
    const publicHistory = JSON.stringify(
      await readTransactions("alice", { limit: 20 }),
    );
    expect(publicHistory).toContain('"currency":"HIVE"');
    expect(publicHistory).not.toMatch(
      /paymentAccount|accountAlias|purchaseReservation|"from":"market"/,
    );
  });
  it("guards the final item write when a reservation wins after its initial read", async () => {
    const item = await marketItem();
    const id = String(item._id);
    await EquipmentModel.updateOne(
      { _id: item._id },
      { $set: { market: null } },
    );
    const original = EquipmentModel.findOne;
    vi.spyOn(EquipmentModel, "findOne").mockImplementationOnce((async (
      ...args: unknown[]
    ) => {
      const snapshot = await Reflect.apply(original, EquipmentModel, args);
      await listItemForSale(id, "seller", 5);
      const listed = await EquipmentModel.findById(id).lean();
      await reserveMarketPurchase(id, {
        key: "racing",
        buyer: "alice",
        currency: "HIVE",
        seller: "seller",
        price: 5,
        fee: 0,
        proceeds: 5,
        name: "Rig",
        rarity: "common",
        listedAt: listed!.market!.listedAt,
        state: "reserved",
      });
      return snapshot;
    }) as never);
    expect((await upgradeItem(id, "seller")).ok).toBe(false);
    expect((await EquipmentModel.findById(id).lean())?.level).toBe(1);
  });
  it.each(["unregistered", "missing"])(
    "fully refunds a verified purchase from a %s buyer before final rejection",
    async (state) => {
      const item = await marketItem();
      const id = String(item._id);
      await marketJob(id);
      if (state === "missing") await PlayerModel.deleteOne({ wallet: "alice" });
      else
        await PlayerModel.updateOne(
          { wallet: "alice" },
          { $set: { isRegistered: false } },
        );
      setup.verify.mockResolvedValueOnce({ status: "pending" });
      await processJob(context, await queued("purchase"));
      expect(await EquipmentModel.findById(id).lean()).toMatchObject({
        owner: "seller",
        market: { isMarket: true },
      });
      expect(
        (await EquipmentModel.findById(id).lean())?.purchaseReservation,
      ).toBeFalsy();
      expect((await queued("purchase")).financialPhase).toBe("refund");
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
      ).toBeNull();
      await processJob(context, await queued("purchase"));
      expect(setup.send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          account: "alice",
          amount: "5.000",
          symbol: "HIVE",
          action: "withdrawal",
        }),
      );
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
      ).toMatchObject({
        status: "failed",
        error: "Player registration is required.",
      });
      expect(
        await ProcessedTransactionModel.findOne({
          txHash: "refund:purchase",
        }).lean(),
      ).toMatchObject({ status: "success", amount: 5 });
      expect(await getStat("totalMarketSales")).toBeNull();
    },
  );
  it("parks an uncertain unregistered-buyer refund without reserving or rebroadcasting", async () => {
    const item = await marketItem();
    await marketJob(String(item._id));
    await PlayerModel.updateOne(
      { wallet: "alice" },
      { $set: { isRegistered: false } },
    );
    setup.send.mockRejectedValueOnce(Error("Unknown broadcast outcome"));
    await processJob(context, await queued("purchase"));
    const job = await queued("purchase");
    expect(job.status).toBe("reconciliation");
    await processJob(context, job);
    expect(setup.send).toHaveBeenCalledOnce();
    expect(
      (await EquipmentModel.findById(item._id).lean())?.purchaseReservation,
    ).toBeFalsy();
    expect(
      await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
    ).toBeNull();
  });
  it("parks missing reservation evidence without restarting eligibility or refunding an existing payout", async () => {
    const item = await marketItem();
    await marketJob(String(item._id));
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    await EquipmentModel.updateOne(
      { _id: item._id },
      { $unset: { purchaseReservation: 1 } },
    );
    await PlayerModel.updateOne(
      { wallet: "alice" },
      { $set: { isRegistered: false } },
    );
    await processJob(context, await queued("purchase"));
    expect((await queued("purchase")).status).toBe("reconciliation");
    expect(setup.send).toHaveBeenCalledOnce();
    expect(setup.send.mock.calls[0][0].account).toBe("seller");
    expect(
      await ProcessedTransactionModel.findOne({
        txHash: "refund:purchase",
      }).lean(),
    ).toBeNull();
  });
  it("keeps seller ownership until payout verification, then finishes once", async () => {
    const item = await marketItem();
    const id = String(item._id);
    await marketJob(id);
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    expect((await EquipmentModel.findById(id).lean())?.owner).toBe("seller");
    // Registration changes do not invalidate an already-proven reservation.
    await PlayerModel.updateOne(
      { wallet: "alice" },
      { $set: { isRegistered: false } },
    );
    await processJob(context, await queued("purchase"));
    expect((await EquipmentModel.findById(id).lean())?.owner).toBe("alice");
    expect(setup.send).toHaveBeenCalledTimes(2);
    expect(await getStat("totalMarketSales")).toBe(1);
    expect(await LogModel.countDocuments({ type: "market" })).toBe(1);
  });
  it("retries finalization after ownership transfer without paying or incrementing twice", async () => {
    const item = await marketItem();
    const id = String(item._id);
    await marketJob(id);
    vi.spyOn(ProcessedTransactionModel, "create").mockRejectedValueOnce(
      Error("receipt unavailable"),
    );
    await processJob(context, await queued("purchase"));
    expect((await EquipmentModel.findById(id).lean())?.owner).toBe("alice");
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledTimes(2);
    expect(await getStat("totalMarketSales")).toBe(1);
    expect(await LogModel.countDocuments({ type: "market" })).toBe(1);
  });
  it.each(["log", "counter", "receipt", "archive", "cleanup"])(
    "recovers a crash after the marketplace %s step",
    async (stage) => {
      const item = await marketItem();
      const id = String(item._id);
      await marketJob(id);
      const target =
        stage === "log"
          ? LogModel
          : stage === "counter"
            ? GameStatModel
            : stage === "cleanup"
              ? InboundTransactionModel
              : ProcessedTransactionModel;
      const method =
        stage === "log"
          ? "findOneAndUpdate"
          : stage === "receipt"
            ? "create"
            : stage === "cleanup"
              ? "deleteOne"
              : "updateOne";
      const original = target[method];
      let injected = false;
      vi.spyOn(target, method).mockImplementation((async (
        ...args: unknown[]
      ) => {
        const update = args[1] as
          { $inc?: unknown; $set?: Record<string, unknown> } | undefined;
        const shouldCrash =
          !injected && (stage !== "counter" || !!update?.$inc);
        if (shouldCrash) injected = true;
        const result = await Reflect.apply(original, target, args);
        if (shouldCrash) throw Error("crash after durable " + stage);
        return result;
      }) as never);
      await processJob(context, await queued("purchase"));
      // A delete acknowledgement can be lost after deletion: its receipt is already durable.
      const pending = await InboundTransactionModel.findOne({
        signature: "purchase",
      });
      if (pending) await processJob(context, pending);
      expect(injected).toBe(true);
      expect((await EquipmentModel.findById(id).lean())?.owner).toBe("alice");
      expect(setup.send).toHaveBeenCalledTimes(2);
      expect(await getStat("totalMarketSales")).toBe(1);
      expect(await LogModel.countDocuments({ type: "market" })).toBe(1);
      expect(
        await ProcessedTransactionModel.countDocuments({ txHash: "purchase" }),
      ).toBe(1);
      expect(
        await InboundTransactionModel.countDocuments({ signature: "purchase" }),
      ).toBe(0);
    },
  );
  it("verifies a buyer refund before releasing a failed seller payout reservation", async () => {
    const item = await marketItem();
    const id = String(item._id);
    await marketJob(id);
    setup.send
      .mockResolvedValueOnce({ success: true, transactionId: "seller-failed" })
      .mockResolvedValue({ success: true, transactionId: "buyer-refund" });
    setup.verify
      .mockResolvedValueOnce({
        status: "failed",
        evidence: { state: "failed", blockNumber: 100, operationIndex: 0 },
      })
      .mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    expect(
      (await EquipmentModel.findById(id).lean())?.purchaseReservation,
    ).toBeDefined();
    await processJob(context, await queued("purchase"));
    expect(await EquipmentModel.findById(id).lean()).toMatchObject({
      owner: "seller",
      market: { isMarket: true },
    });
    expect(
      (await EquipmentModel.findById(id).lean())?.purchaseReservation,
    ).toBeUndefined();
    expect(setup.send).toHaveBeenCalledTimes(2);
  });
  it.each([
    [0.001, "0.001", null],
    [0.019, "0.019", null],
    [0.02, "0.019", "0.001"],
    [0.039, "0.038", "0.001"],
    [1, "0.950", "0.050"],
  ])(
    "forwards only the recorded milli-HIVE fee for price %s",
    async (price, sellerAmount, feeAmount) => {
      const id = await feePurchase(Number(price));
      await processJob(context, await queued("purchase"));
      expect(setup.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ account: "seller", amount: sellerAmount }),
      );
      if (feeAmount)
        expect(setup.send).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ account: "treasury", amount: feeAmount }),
        );
      expect(setup.send).toHaveBeenCalledTimes(feeAmount ? 2 : 1);
      const receipt = await ProcessedTransactionModel.findOne({
        txHash: "purchase",
      }).lean();
      expect(receipt).toMatchObject({
        status: "success",
        metadata: { marketFeeStatus: feeAmount ? "paid" : "not_due" },
      });
      expect(
        (await EquipmentModel.findById(id).lean())?.purchaseReservation,
      ).toBeUndefined();
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
    },
  );
  it("retains the fee without self-transfer when market and treasury are identical", async () => {
    Object.assign(config.blockchain, { treasuryAccount: "market" });
    await feePurchase(0.1, "market");
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(
      await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
    ).toMatchObject({
      status: "success",
      metadata: {
        marketFeeStatus: "not_due",
        marketFeeObligation: { from: "market", to: "market", feeMilli: 5 },
      },
    });
  });
  it("confirms and unlocks the purchase while its fee is pending, without hiding the receipt or blocking resale", async () => {
    const id = await feePurchase();
    setup.verify.mockImplementation(async (intent) =>
      intent.to === "treasury"
        ? { status: "pending" }
        : {
            status: "confirmed",
            evidence: {
              state: "confirmed",
              blockNumber: 100,
              operationIndex: 0,
            },
          },
    );
    await processJob(context, await queued("purchase"));
    expect(
      await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
    ).toMatchObject({
      status: "success",
      metadata: {
        marketFeeStatus: "pending",
        treasuryTransfers: [
          expect.objectContaining({
            intent: expect.objectContaining({ to: "seller" }),
            state: "confirmed",
          }),
        ],
      },
    });
    expect(await queued("purchase")).toMatchObject({
      marketFeeStatus: "pending",
      retryCount: 0,
    });
    expect(
      (await EquipmentModel.findById(id).lean())?.purchaseReservation,
    ).toBeUndefined();
    const history = await readTransactions("alice", { limit: 100 });
    expect(history.pending).toEqual([]);
    expect(history.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "market_purchase", status: "success" }),
      ]),
    );
    for (const privateField of [
      "marketFeePolicyVersion",
      "marketFeeStatus",
      "marketFeeObligation",
      "marketFeeTreasuryAccount",
      "treasuryTransfers",
    ])
      expect(JSON.stringify(history)).not.toContain(privateField);
    expect((await listItemForSale(id, "alice", 0.2)).ok).toBe(true);
    setup.verify.mockResolvedValue({
      status: "confirmed",
      evidence: { state: "confirmed", blockNumber: 100, operationIndex: 0 },
    });
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledTimes(2);
    expect(await EquipmentModel.findById(id).lean()).toMatchObject({
      owner: "alice",
      market: { isMarket: true, price: 0.2 },
    });
    expect(await getStat("totalMarketSales")).toBe(1);
    expect(await LogModel.countDocuments({ type: "market" })).toBe(1);
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
  });
  it.each(["missing-id", "exception", "failed"])(
    "keeps a %s fee parked without undoing the completed sale",
    async (failure) => {
      const id = await feePurchase();
      if (failure === "failed")
        setup.verify.mockImplementation(async (intent) => ({
          status: intent.to === "treasury" ? "failed" : "confirmed",
          evidence: {
            state: intent.to === "treasury" ? "failed" : "confirmed",
            blockNumber: 100,
            operationIndex: 0,
          },
        }));
      else
        setup.send.mockImplementation(async ({ account }) => {
          if (account !== "treasury")
            return { success: true, transactionId: "seller-tx" };
          if (failure === "exception") throw Error("unknown fee broadcast");
          return { success: true };
        });
      await processJob(context, await queued("purchase"));
      await processJob(context, await queued("purchase"));
      expect(setup.send).toHaveBeenCalledTimes(2);
      const job = await queued("purchase");
      expect(job).toMatchObject({
        status: "reconciliation",
        marketFeeStatus: "pending",
      });
      await expect(completeJob(String(job._id))).rejects.toThrow();
      await expect(
        finishMarketFeeObligation("purchase", "not_due"),
      ).rejects.toThrow();
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
      ).toMatchObject({ status: "success" });
      expect(
        await ProcessedTransactionModel.findOne({
          txHash: "refund:purchase",
        }).lean(),
      ).toBeNull();
      expect(await LogModel.countDocuments({ type: "error" })).toBe(0);
      expect(await EquipmentModel.findById(id).lean()).toMatchObject({
        owner: "alice",
      });
      expect((await equipItem(id, "alice")).ok).toBe(true);
      expect((await readTransactions("alice", { limit: 100 })).pending).toEqual(
        [],
      );
    },
  );
  it("reconciles the exact fee transaction and completes without repeating either payout", async () => {
    await feePurchase();
    setup.send
      .mockResolvedValueOnce({ success: true, transactionId: "seller-tx" })
      .mockResolvedValueOnce({ success: true });
    await processJob(context, await queued("purchase"));
    await reconcileTreasurySettlement(
      "purchase",
      "market-fee:purchase",
      "fee-tx",
    );
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledTimes(2);
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
    expect(
      await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
    ).toMatchObject({
      metadata: {
        marketFeeStatus: "paid",
        treasuryTransfers: expect.arrayContaining([
          expect.objectContaining({
            key: "market-fee:purchase",
            transactionId: "fee-tx",
          }),
        ]),
      },
    });
  });
  it.each(["", "changed-treasury"])(
    "parks missing or changed captured treasury routing before seller payout: %s",
    async (route) => {
      const id = await feePurchase(0.1, route);
      await processJob(context, await queued("purchase"));
      expect(setup.send).not.toHaveBeenCalled();
      expect(await queued("purchase")).toMatchObject({
        status: "reconciliation",
      });
      expect((await EquipmentModel.findById(id).lean())?.owner).toBe("seller");
    },
  );
  it("never reroutes a saved fee after treasury configuration changes", async () => {
    const id = await feePurchase();
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    // Finish the already-submitted seller payout before testing a post-source routing change.
    setup.verify.mockImplementation(async (intent) =>
      intent.to === "treasury"
        ? { status: "pending" }
        : {
            status: "confirmed",
            evidence: {
              state: "confirmed",
              blockNumber: 100,
              operationIndex: 0,
            },
          },
    );
    await processJob(context, await queued("purchase"));
    Object.assign(config.blockchain, { treasuryAccount: "changed-treasury" });
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledTimes(2);
    expect(await queued("purchase")).toMatchObject({
      status: "reconciliation",
      marketFeeObligation: { to: "treasury" },
    });
    expect(
      (await EquipmentModel.findById(id).lean())?.purchaseReservation,
    ).toBeUndefined();
    expect(
      await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
    ).toMatchObject({ status: "success" });
  });
  it("preserves legacy marketplace jobs without introducing fee obligations", async () => {
    await feePurchase();
    await InboundTransactionModel.updateOne(
      { signature: "purchase" },
      { $unset: { marketFeePolicyVersion: 1, marketFeeTreasuryAccount: 1 } },
    );
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledOnce();
    const receipt = await ProcessedTransactionModel.findOne({
      txHash: "purchase",
    }).lean();
    expect(receipt?.metadata?.marketFeeObligation).toBeUndefined();
    expect(await InboundTransactionModel.countDocuments()).toBe(0);
  });
  it("parks partially missing fee policy evidence rather than treating it as a legacy job", async () => {
    await feePurchase();
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    await InboundTransactionModel.updateOne(
      { signature: "purchase" },
      { $unset: { marketFeePolicyVersion: 1 } },
    );
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(await queued("purchase")).toMatchObject({
      status: "reconciliation",
    });
  });
  it("unlocks a completed sale even if treasury routing changes before cleanup recovery", async () => {
    const id = await feePurchase();
    const fault = failMarketFeeWriteAfter("source-receipt");
    await processJob(context, await queued("purchase"));
    expect(fault.injected()).toBe(true);
    Object.assign(config.blockchain, { treasuryAccount: "new-treasury" });
    await processJob(context, await queued("purchase"));
    expect(
      (await EquipmentModel.findById(id).lean())?.purchaseReservation,
    ).toBeUndefined();
    expect((await equipItem(id, "alice")).ok).toBe(true);
    expect(await queued("purchase")).toMatchObject({
      status: "reconciliation",
    });
    expect(setup.send).toHaveBeenCalledOnce();
  });
  it.each([
    { "metadata.fee": "bad" },
    { "metadata.itemId": "other" },
    { "metadata.paymentOperationIndex": 3 },
    { "metadata.marketFeeObligation.to": "other-treasury" },
  ])(
    "parks mismatched source receipts without replaying the purchase: %j",
    async (change) => {
      await feePurchase();
      setup.verify.mockImplementation(async (intent) =>
        intent.to === "treasury"
          ? { status: "pending" }
          : {
              status: "confirmed",
              evidence: {
                state: "confirmed",
                blockNumber: 100,
                operationIndex: 0,
              },
            },
      );
      await processJob(context, await queued("purchase"));
      await ProcessedTransactionModel.updateOne(
        { txHash: "purchase" },
        { $set: change },
      );
      await processJob(context, await queued("purchase"));
      expect(await queued("purchase")).toMatchObject({
        status: "reconciliation",
      });
      expect(setup.send).toHaveBeenCalledTimes(2);
      expect(await getStat("totalMarketSales")).toBe(1);
      expect(await LogModel.countDocuments({ type: "market" })).toBe(1);
      expect(await LogModel.countDocuments({ type: "error" })).toBe(0);
    },
  );
  it("refuses to change an already captured fee obligation", async () => {
    await feePurchase();
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    const saved = (await queued("purchase")).marketFeeObligation!;
    const result = await captureMarketFeeObligation("purchase", {
      ...saved,
      to: "other-treasury",
    });
    expect(result.to).toBe("treasury");
    await InboundTransactionModel.updateOne(
      { signature: "purchase" },
      { $set: { "marketFeeObligation.to": "other-treasury" } },
    );
    await processJob(context, await queued("purchase"));
    expect(setup.send).toHaveBeenCalledOnce();
    expect(await queued("purchase")).toMatchObject({
      status: "reconciliation",
    });
  });
  it.each([
    "capture",
    "source-receipt",
    "source-archive",
    "item-unlock",
    "counter-cleanup",
    "fee-submission",
    "fee-verification",
    "paid-marker",
    "final-archive",
    "job-cleanup",
  ])(
    "recovers a lost acknowledgement after marketplace fee %s without duplicate effects",
    async (stage) => {
      const id = await feePurchase();
      const fault = failMarketFeeWriteAfter(stage);
      await processJob(context, await queued("purchase"));
      expect(fault.injected()).toBe(true);
      let pending = await InboundTransactionModel.findOne({
        signature: "purchase",
      });
      if (pending?.status === "reconciliation" && stage === "fee-submission") {
        await reconcileTreasurySettlement(
          "purchase",
          "market-fee:purchase",
          "fee-tx",
        );
        pending = await queued("purchase");
      }
      if (pending) await processJob(context, pending);
      expect(setup.send).toHaveBeenCalledTimes(2);
      expect(await EquipmentModel.findById(id).lean()).toMatchObject({
        owner: "alice",
      });
      expect(
        (await EquipmentModel.findById(id).lean())?.purchaseReservation,
      ).toBeUndefined();
      expect(await getStat("totalMarketSales")).toBe(1);
      expect(await LogModel.countDocuments({ type: "market" })).toBe(1);
      expect(
        await ProcessedTransactionModel.countDocuments({ txHash: "purchase" }),
      ).toBe(1);
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "purchase" }).lean(),
      ).toMatchObject({
        status: "success",
        metadata: { marketFeeStatus: "paid" },
      });
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
    },
  );
  it("increments each financial statistic once concurrently", async () => {
    await Promise.all([
      incrementSettlementStat("totalMarketSales", "purchase"),
      incrementSettlementStat("totalMarketSales", "purchase"),
    ]);
    expect(await getStat("totalMarketSales")).toBe(1);
  });
  it("excludes reservation and transfer evidence from public inventory and history", async () => {
    const item = await marketItem();
    const id = String(item._id);
    await marketJob(id);
    setup.verify.mockResolvedValueOnce({ status: "pending" });
    await processJob(context, await queued("purchase"));
    const inventory = JSON.stringify(await readInventory("seller"));
    expect(inventory).not.toContain("purchaseReservation");
    await processJob(context, await queued("purchase"));
    const history = JSON.stringify(
      await readTransactions("alice", { limit: 100 }),
    );
    for (const field of [
      "treasuryTransfers",
      "verifiedAt",
      "settlementKey",
      "financialWorkflowVersion",
      "withdrawalPayoutPolicyVersion",
      "reservationAccepted",
    ])
      expect(history).not.toContain(field);
  });
});
