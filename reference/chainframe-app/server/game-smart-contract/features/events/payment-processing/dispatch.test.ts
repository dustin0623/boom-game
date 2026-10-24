import { getFixtureRepositories } from "@/tests/fixtures/persistence";
import { emptyGameQueue } from "@/tests/fixtures/gameplay-queue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hiveClient } from "@/lib/chains/modules/hive/client";
const m = vi.hoisted(() => {
  const state = {
    hash: 0,
    registered: true,
    registrationTxId: null as string | null,
    minerate: 0,
    consumables: 0,
    receipts: new Map<string, unknown>(),
    logs: [] as unknown[],
    completed: [] as string[],
    owner: "seller",
  };
  return {
    state,
    verifyToken: vi.fn(),
    verifyHive: vi.fn(),
    payout: vi.fn(),
    fail: vi.fn(),
    park: vi.fn(),
    complete: vi.fn(),
    register: vi.fn(),
    grant: vi.fn(),
    credit: vi.fn(),
    transfer: vi.fn(),
    item: vi.fn(),
    tx: vi.fn(),
    increment: vi.fn(),
    claim: vi.fn(),
  };
});
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: {
      treasuryAccount: "treasury",
      marketAccount: "market",
      token: "HASH",
      tokenPrecision: 3,
    },
  },
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-token-payment/action",
  () => ({ verifyTokenPayment: m.verifyToken }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-native-payment/action",
  () => ({ verifyNativePayment: m.verifyHive }),
);
vi.mock(
  "@/server/game-smart-contract/features/events/treasury/withdrawal-payout",
  () => ({ dispatchWithdrawalPayout: m.payout }),
);
vi.mock(
  "@/server/game-smart-contract/features/events/treasury/dispatch",
  () => ({
    dispatchTreasuryTransfer: m.payout,
  }),
);
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  readQueuedGameBatches: emptyGameQueue,
  completeJob: m.complete,
  getPendingTreasuryTransfers: vi.fn(async () => []),
  findPendingBySignature: vi.fn(async () => null),
  markJobRefunded: vi.fn(),
  failJob: m.fail,
  parkJob: m.park,
  setMarketSettlement: vi.fn(),
  captureRegistrationStarterPack: vi.fn(async (_signature, value) => value),
  recordRegistrationStarterGrant: vi.fn(),
  markRegistrationStarterArchived: vi.fn(),
  captureReferralObligation: vi.fn(async (_signature, value) => value),
  finishReferralObligation: vi.fn(),
  setFinancialPhase: vi.fn(),
  markRecoverableFinancialJob: vi.fn(),
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  getProcessedTransaction: async (id: string) =>
    m.state.receipts.get(id) ?? null,
  claimProcessedTransaction: m.claim,
  insertProcessedTransaction: async (row: { txHash: string }) => {
    m.state.receipts.set(row.txHash, row);
  },
  recordFailedTransaction: async (row: { txHash: string }) => {
    m.state.receipts.set(row.txHash, { ...row, failed: true });
  },
  archiveTreasuryTransfers: vi.fn(),
}));
vi.mock("@/lib/modules/players/server.repository", async (_original) => ({
  findPlayerByWallet: vi.fn(async () => ({ isRegistered: m.state.registered })),
  ...(await (() => ({
    creditHash: m.credit,
    getWithdrawalReservation: vi.fn(async () => ({
      amount: 5,
      state: "reserved",
    })),
    refundWithdrawalReservation: vi.fn(),
    clearWithdrawalReservation: vi.fn(),
  }))()),
  playerRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().players[
          key as keyof ReturnType<typeof getFixtureRepositories>["players"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/equipments/server.repository", async (_original) => ({
  ...(await (() => ({
    findEquipmentById: m.item,
    transferOwnership: m.transfer,
    reserveMarketPurchase: vi.fn(async (_id, value) => value),
    finishMarketPurchase: m.transfer,
    releaseMarketPurchase: vi.fn(),
    clearMarketReservation: vi.fn(),
  }))()),
  equipmentRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().equipments[
          key as keyof ReturnType<typeof getFixtureRepositories>["equipments"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/logs/server.repository", async (_original) => ({
  ...(await (() => ({
    createLog: async (log: unknown) => {
      m.state.logs.push(log);
    },
    createErrorLog: vi.fn(),
  }))()),
  logRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().logs[
          key as keyof ReturnType<typeof getFixtureRepositories>["logs"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (_original) => ({
  ...(await (() => ({
    incrementStat: m.increment,
    incrementSettlementStat: m.increment,
    clearSettlementStat: vi.fn(),
  }))()),
  gameStatsRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().gameStats[
          key as keyof ReturnType<typeof getFixtureRepositories>["gameStats"]
        ],
    },
  ),
}));
vi.mock("@/features/events/backend/shop-pricing/prices.server", () => ({
  getLiveEquipmentChestPrice: async () => 10,
  getLiveConsumablePrice: async () => ({ unitPrice: 1, pricedEmission: 0 }),
}));
vi.mock("@/features/events/backend/player-lifecycle/register", () => ({
  registerPlayer: m.register,
}));
vi.mock("@/lib/modules/items/server.repository", () => ({
  inventoryItemRepository: { grant: m.grant, quantity: async () => 0 },
}));
vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: () => ({
    transaction: m.tx,
    logs: {
      create: async (log: unknown) => {
        m.state.logs.push(log);
      },
    },
    players: {
      findByWallet: async () => ({
        isRegistered: m.state.registered,
        registrationTxId: m.state.registrationTxId,
      }),
      touchSink: vi.fn(),
    },
  }),
}));
import { processJob } from "./dispatch";
import { SettlementUncertainError } from "@/server/game-smart-contract/features/events/treasury/errors.server";
import { DatabaseOperationUncertainError } from "@/lib/utils/database/operation.server";
import { REGISTRATION_FEE_HIVE } from "@/lib/config/constants/game";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
const context = { checkLease: vi.fn(async () => {}), maxRetries: 3 };
function job(type: IInboundTransaction["type"], overrides: object = {}) {
  return {
    _id: "job",
    signature: "payment",
    type,
    walletAddress: "alice",
    paymentOperationIndex: 2,
    depositTxId: "payment",
    paymentTxId: "payment",
    depositAmount: 5,
    withdrawAmount: 5,
    registrationHiveAmount: REGISTRATION_FEE_HIVE,
    shopHiveAmount: 0.2,
    shopKind: "consumable",
    shopItemId: "help-kit",
    shopQuantity: 2,
    shopFulfillment: "inventory",
    ...(type === "registration" || type === "shop_purchase"
      ? { referralPolicyVersion: 1 }
      : {}),
    itemId: "item",
    price: 5,
    ...(type === "market_purchase"
      ? {
          paymentCurrency: "HIVE",
          paymentAccount: "market",
          financialWorkflowVersion: 1,
        }
      : {}),
    createdAt: new Date(),
    ...(type === "withdrawal"
      ? { financialWorkflowVersion: 1, financialPhase: "reserved" }
      : {}),
    ...overrides,
  } as unknown as IInboundTransaction;
}
function verification(action: string, amount: number, metadata: object = {}) {
  return {
    transactionId: "payment",
    blockNumber: 100,
    blockTimestamp: "2026-10-18T12:00:00",
    symbol: action === "deposit" ? "HASH" : "HIVE",
    success: true,
    status: "confirmed",
    operationIndex: 2,
    from: "alice",
    to: action === "market_purchase" ? "market" : "treasury",
    amount: String(amount),
    trigger: { action, metadata },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(hiveClient, "resolveAccount").mockReturnValue({
    account: "treasury",
  } as never);
  Object.assign(m.state, {
    hash: 0,
    registered: true,
    registrationTxId: null,
    minerate: 0,
    consumables: 0,
    receipts: new Map(),
    logs: [],
    completed: [],
    owner: "seller",
  });
  m.tx.mockImplementation(async (execute) => execute());
  m.complete.mockImplementation(async (id) => {
    m.state.completed.push(id);
  });
  m.claim.mockImplementation(async (row) => {
    if (m.state.receipts.has(row.txHash)) return { claimed: false };
    m.state.receipts.set(row.txHash, { ...row, status: "success" });
    return { claimed: true };
  });
  m.credit.mockImplementation(async (_wallet, amount) => {
    m.state.hash += amount;
  });
  m.register.mockImplementation(
    async (_wallet, _txId, items = [], onGranted) => {
      if (m.state.registered)
        return { changed: false, startingHash: 0, startingItems: [] };
      m.state.registered = true;
      m.state.registrationTxId = "payment";
      m.state.minerate += 1;
      m.state.hash += 10;
      for (const award of items) {
        await m.grant(_wallet, award.itemId, award.quantity);
        await onGranted?.(award);
      }
      return { changed: true, startingHash: 10, startingItems: items };
    },
  );
  m.grant.mockImplementation(
    async (_wallet: string, _id: string, quantity: number) => {
      m.state.consumables += quantity;
    },
  );
  m.item.mockImplementation(async () => ({
    owner: m.state.owner,
    name: "Rig",
    rarity: "common",
    market: { isMarket: true, currency: "HIVE", price: 5 },
  }));
  m.transfer.mockImplementation(async (_id, _from, _to) => {
    m.state.owner = "alice";
    return { ok: true };
  });
  m.payout.mockResolvedValue({
    status: "confirmed",
    success: true,
    transactionId: "payout",
  });
  m.fail.mockResolvedValue(false);
  m.verifyToken.mockResolvedValue(verification("deposit", 5));
  m.verifyHive.mockResolvedValue(
    verification("registration", REGISTRATION_FEE_HIVE),
  );
});
describe("authoritative payment job settlement", () => {
  it("credits a verified deposit once with its log and receipt", async () => {
    await processJob(context, job("deposit"));
    await processJob(context, job("deposit"));
    expect(m.state.hash).toBe(5);
    expect(m.state.logs).toHaveLength(1);
    expect(m.state.receipts.get("payment")).toMatchObject({
      metadata: { paymentOperationIndex: 2, creditedAmount: 5 },
    });
  });
  it("parks an interrupted completion without retrying deposit credit", async () => {
    m.complete.mockRejectedValueOnce(
      new DatabaseOperationUncertainError(new Error("write failed")),
    );
    await processJob(context, job("deposit"));
    expect(m.state.hash).toBe(5);
    expect(m.state.logs).toHaveLength(1);
    expect(m.state.receipts.size).toBe(1);
    expect(m.park).toHaveBeenCalledWith(
      "job",
      expect.stringContaining("operator review"),
    );
    expect(m.fail).not.toHaveBeenCalled();
  });
  it("records the full event package once even when processing is delayed", async () => {
    m.state.registered = false;
    m.verifyHive.mockResolvedValue({
      ...verification("registration", REGISTRATION_FEE_HIVE),
      blockTimestamp: "2026-10-19T00:00:00",
    });
    const registration = job("registration");
    await processJob(context, registration);
    await processJob(context, registration);
    expect(m.grant.mock.calls.map((call) => call.slice(1))).toEqual([
      ["equipment", 4],
      ["sabotage-device", 10],
      ["help-kit", 10],
    ]);
    expect(m.state.receipts.get("payment")).toMatchObject({
      metadata: {
        startingHash: 10,
        startingItems: [
          { itemId: "equipment", quantity: 4 },
          { itemId: "sabotage-device", quantity: 10 },
          { itemId: "help-kit", quantity: 10 },
        ],
      },
    });
    expect(m.register).toHaveBeenCalledTimes(1);
    expect(m.state.logs).toHaveLength(1);
  });
  it.each(["time", "decision", "interrupted"])(
    "parks registration before rewards for missing or changed %s evidence",
    async (fault) => {
      m.state.registered = false;
      const payment = verification("registration", REGISTRATION_FEE_HIVE);
      if (fault === "time") payment.blockTimestamp = "";
      m.verifyHive.mockResolvedValue(payment);
      await processJob(
        context,
        job(
          "registration",
          fault === "decision"
            ? { registrationStarterPack: { version: 999 } }
            : fault === "interrupted"
              ? { databaseEffectsStarted: true }
              : {},
        ),
      );
      expect(m.park).toHaveBeenCalled();
      expect(m.register).not.toHaveBeenCalled();
      expect(m.grant).not.toHaveBeenCalled();
      expect(m.state.receipts.size).toBe(0);
    },
  );

  it("registers once and writes its receipt after the registration effects", async () => {
    m.state.registered = false;
    await processJob(context, job("registration"));
    await processJob(context, job("registration"));
    expect(m.register).toHaveBeenCalledTimes(1);
    expect(m.state.minerate).toBe(1);
    expect(m.tx).toHaveBeenCalled();
    expect(m.state.logs).toHaveLength(1);
    expect(m.state.hash).toBe(10);
    expect(m.state.logs[0]).toMatchObject({
      type: "registration",
      amount: REGISTRATION_FEE_HIVE,
      data: { startingHash: 10 },
    });
    expect(m.state.receipts.get("payment")).toMatchObject({
      amount: REGISTRATION_FEE_HIVE,
      metadata: {
        startingHash: 10,
        registrationHiveAmountPaid: REGISTRATION_FEE_HIVE,
      },
    });
  });
  it("does not claim a starting award for an already-registered matching payment", async () => {
    m.state.registrationTxId = "payment";
    await processJob(context, job("registration"));
    expect(m.state.hash).toBe(0);
    expect(m.state.logs).toHaveLength(0);
    expect(m.state.receipts.size).toBe(0);
    expect(m.park).toHaveBeenCalled();
  });
  it("retains registration effects and retries keyed cleanup after the source receipt", async () => {
    m.state.registered = false;
    m.complete.mockRejectedValueOnce(
      new DatabaseOperationUncertainError(new Error("completion failed")),
    );
    const registration = job("registration");
    await processJob(context, registration);
    expect(m.state.registered).toBe(true);
    expect(m.state.hash).toBe(10);
    expect(m.state.minerate).toBe(1);
    expect(m.state.receipts.size).toBe(1);
    expect(m.park).not.toHaveBeenCalled();
    expect(m.fail).toHaveBeenCalledOnce();
    await processJob(context, registration);
    expect(m.state.hash).toBe(10);
    expect(m.register).toHaveBeenCalledOnce();
    expect(m.state.completed).toEqual(["job"]);
  });
  it("never processes a financial job carrying an interrupted-write marker", async () => {
    await processJob(context, job("deposit", { databaseEffectsStarted: true }));
    expect(m.verifyToken).not.toHaveBeenCalled();
    expect(m.credit).not.toHaveBeenCalled();
    expect(m.payout).not.toHaveBeenCalled();
    expect(m.park).toHaveBeenCalledWith(
      "job",
      expect.stringContaining("operator review"),
    );
  });
  it("refunds a wrong registration amount rather than registering", async () => {
    m.state.registered = false;
    m.verifyHive.mockResolvedValue(verification("registration", 1));
    await processJob(context, job("registration"));
    expect(m.register).not.toHaveBeenCalled();
    expect(m.payout).toHaveBeenCalledWith(
      context,
      "payment",
      "refundRegistration:payment",
      "alice",
      "1.000",
      "HIVE",
      "Chainframe registration refund payment",
    );
    expect(m.state.receipts.get("payment")).toMatchObject({ failed: true });
  });
  it("parks uncertain registration refunds immediately", async () => {
    m.state.registered = false;
    m.verifyHive.mockResolvedValue(verification("registration", 1));
    m.payout.mockRejectedValue(
      new SettlementUncertainError("refundRegistration:payment"),
    );
    await processJob(context, job("registration"));
    expect(m.park).toHaveBeenCalledOnce();
    expect(m.fail).not.toHaveBeenCalled();
    expect(m.register).not.toHaveBeenCalled();
  });
  it("records a repeated confirmed refund's receipt and log once", async () => {
    m.state.registered = false;
    m.verifyHive.mockResolvedValue(verification("registration", 1));
    await processJob(context, job("registration"));
    await processJob(context, job("registration"));
    expect(m.state.receipts.has("refund:payment")).toBe(true);
    expect(m.state.logs).toHaveLength(1);
  });
  it("parks uncertain shop refunds immediately", async () => {
    m.state.registered = false;
    m.verifyHive.mockResolvedValue(
      verification("shop_purchase", 0.2, {
        kind: "consumable",
        itemId: "help-kit",
        quantity: 2,
      }),
    );
    m.payout.mockRejectedValue(
      new SettlementUncertainError("refundShopPurchase:payment"),
    );
    await processJob(context, job("shop_purchase"));
    expect(m.park).toHaveBeenCalledOnce();
    expect(m.fail).not.toHaveBeenCalled();
    expect(m.state.consumables).toBe(0);
  });
  it("grants HIVE shop consumables once", async () => {
    m.verifyHive.mockResolvedValue(
      verification("shop_purchase", 0.2, {
        kind: "consumable",
        itemId: "help-kit",
        quantity: 2,
      }),
    );
    await processJob(context, job("shop_purchase"));
    await processJob(context, job("shop_purchase"));
    expect(m.state.consumables).toBe(2);
    expect(m.state.logs).toHaveLength(1);
  });
  it("parks pre-update shop jobs without inventory-fulfillment evidence before effects", async () => {
    await processJob(
      context,
      job("shop_purchase", { shopFulfillment: undefined }),
    );
    expect(m.park).toHaveBeenCalledWith(
      "job",
      expect.stringContaining("fulfillment evidence"),
    );
    expect(m.verifyHive).not.toHaveBeenCalled();
    expect(m.grant).not.toHaveBeenCalled();
    expect(m.payout).not.toHaveBeenCalled();
  });
  it("grants chest inventory without minting equipment or publishing a reward identity", async () => {
    m.verifyHive.mockResolvedValue(
      verification("shop_purchase", 10, {
        kind: "chest",
        itemId: "equipment",
        quantity: 1,
      }),
    );
    await processJob(
      context,
      job("shop_purchase", {
        shopKind: "chest",
        shopItemId: "equipment",
        shopQuantity: 1,
        shopHiveAmount: 10,
      }),
    );
    expect(m.grant).toHaveBeenCalledTimes(1);
    expect(m.grant).toHaveBeenCalledWith("alice", "equipment", 1);
    expect(m.state.receipts.get("payment")).toMatchObject({
      metadata: { shopKind: "chest", shopItemId: "equipment", shopQuantity: 1 },
    });
  });
  it("refunds shop payments from unregistered players", async () => {
    m.state.registered = false;
    m.verifyHive.mockResolvedValue(
      verification("shop_purchase", 0.2, {
        kind: "consumable",
        itemId: "help-kit",
        quantity: 2,
      }),
    );
    await processJob(context, job("shop_purchase"));
    expect(m.state.consumables).toBe(0);
    expect(m.payout).toHaveBeenCalledWith(
      context,
      "payment",
      "refundShopPurchase:payment",
      "alice",
      "0.200",
      "HIVE",
      "Chainframe shop refund payment",
    );
  });
  it("transfers a market item and records the original operation identity", async () => {
    m.verifyHive.mockResolvedValue(
      verification("market_purchase", 5, { itemId: "item" }),
    );
    await processJob(context, job("market_purchase"));
    await processJob(context, job("market_purchase"));
    expect(m.state.owner).toBe("alice");
    expect(m.transfer).toHaveBeenCalledTimes(1);
    expect(m.payout).toHaveBeenCalledTimes(1);
    expect(m.payout).toHaveBeenCalledWith(
      context,
      "payment",
      "market-sale:payment",
      "seller",
      "4.750",
      "HIVE",
      "Chainframe marketplace sale payment",
      "market",
      "market",
    );
    expect(m.state.receipts.get("payment")).toMatchObject({
      metadata: { itemId: "item", paymentOperationIndex: 2 },
    });
  });
  it.each([
    { paymentCurrency: undefined },
    { paymentAccount: undefined },
    { paymentAccount: "former-market" },
  ])(
    "parks legacy or changed routing %j without verification, payout or ownership mutation",
    async (change) => {
      await processJob(context, job("market_purchase", change));
      expect(m.park).toHaveBeenCalledWith(
        "job",
        expect.stringContaining("routing"),
      );
      expect(m.verifyHive).not.toHaveBeenCalled();
      expect(m.payout).not.toHaveBeenCalled();
      expect(m.transfer).not.toHaveBeenCalled();
    },
  );
  it.each([
    { from: "other" },
    { to: "treasury" },
    { symbol: "HASH" },
    { transactionId: "other" },
    { amount: "5.001" },
  ])(
    "rejects mismatched marketplace payment evidence %j before reserving",
    async (change) => {
      m.verifyHive.mockResolvedValue({
        ...verification("market_purchase", 5, { itemId: "item" }),
        ...change,
      });
      await processJob(context, job("market_purchase"));
      expect(m.payout).not.toHaveBeenCalled();
      expect(m.item).not.toHaveBeenCalled();
      expect(m.transfer).not.toHaveBeenCalled();
      expect(m.state.receipts.get("payment")).toMatchObject({
        failed: true,
        metadata: { currency: "HIVE" },
      });
    },
  );
  it("refunds a market payment when the listing disappears", async () => {
    m.item.mockResolvedValue(null);
    m.verifyHive.mockResolvedValue(
      verification("market_purchase", 5, { itemId: "item" }),
    );
    await processJob(context, job("market_purchase"));
    expect(m.transfer).not.toHaveBeenCalled();
    expect(m.payout).toHaveBeenCalledWith(
      context,
      "payment",
      "refundMarketPurchase:payment",
      "alice",
      "5.000",
      "HIVE",
      "Chainframe marketplace refund payment",
      "market",
      "market",
    );
  });
  it("parks uncertain market payouts without refunding or transferring again", async () => {
    m.verifyHive.mockResolvedValue(
      verification("market_purchase", 5, { itemId: "item" }),
    );
    m.payout.mockRejectedValue(
      new SettlementUncertainError("market-sale:payment"),
    );
    const settled = {
      seller: "seller",
      price: 5,
      fee: 0,
      proceeds: 5,
      name: "Rig",
      rarity: "common",
    };
    await processJob(
      context,
      job("market_purchase", { marketSettlement: settled }),
    );
    expect(m.transfer).not.toHaveBeenCalled();
    expect(m.park).toHaveBeenCalled();
    expect(m.fail).not.toHaveBeenCalled();
  });
  it("records withdrawal completion without another local debit", async () => {
    await processJob(context, job("withdrawal"));
    expect(m.credit).not.toHaveBeenCalled();
    expect(m.state.receipts.get("payment")).toMatchObject({
      amount: -5,
      metadata: { payoutTxHash: "payout" },
    });
  });
  it("parks an uncertain withdrawal instead of crediting or rebroadcasting", async () => {
    m.payout.mockRejectedValue(
      new SettlementUncertainError("processWithdrawal:payment"),
    );
    await processJob(context, job("withdrawal"));
    expect(m.park).toHaveBeenCalled();
    expect(m.credit).not.toHaveBeenCalled();
  });
  it.each([
    "deposit",
    "registration",
    "shop_purchase",
    "market_purchase",
  ] as const)("rejects mismatched operation indexes for %s", async (type) => {
    const bad = { ...verification("deposit", 5), operationIndex: 3 };
    m.verifyToken.mockResolvedValue(bad);
    m.verifyHive.mockResolvedValue(bad);
    await processJob(context, job(type));
    expect(m.park).toHaveBeenCalledWith(
      "job",
      "Payment operation mismatch; indexed reconciliation required",
    );
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.payout).not.toHaveBeenCalled();
  });
  it.each(["deposit", "registration", "shop_purchase"] as const)(
    "keeps pending %s observations outside the failure budget",
    async (type) => {
      m.verifyToken.mockResolvedValue({ status: "pending" });
      m.verifyHive.mockResolvedValue({ status: "pending" });
      await processJob(context, job(type));
      expect(m.fail).not.toHaveBeenCalled();
      expect(m.complete).not.toHaveBeenCalled();
    },
  );
  it.each(["deposit", "registration", "shop_purchase"] as const)(
    "records rejected %s payments without game effects",
    async (type) => {
      m.verifyToken.mockResolvedValue({
        success: false,
        status: "failed",
        operationIndex: 2,
        error: "invalid",
      });
      m.verifyHive.mockResolvedValue({
        success: false,
        status: "failed",
        operationIndex: 2,
        error: "invalid",
      });
      await processJob(context, job(type));
      expect(m.state.receipts.get("payment")).toMatchObject({ failed: true });
      expect(m.state.hash).toBe(0);
      expect(m.state.consumables).toBe(0);
      expect(m.register).not.toHaveBeenCalled();
    },
  );
  it("parks exhausted transient retries for reconciliation", async () => {
    m.verifyToken.mockRejectedValue(new Error("RPC timeout"));
    m.fail.mockResolvedValue(true);
    await processJob(context, job("deposit"));
    expect(m.park).toHaveBeenCalledWith(
      "job",
      "Settlement retry limit reached: RPC timeout",
    );
    expect(m.complete).not.toHaveBeenCalled();
  });
});
vi.mock(
  "@/server/game-smart-contract/features/events/process-game-action/persistence",
  () => ({
    gameActionPersistence: new Proxy(
      {},
      {
        get: (_, key) =>
          getFixtureRepositories().gameEvents[
            key as keyof ReturnType<typeof getFixtureRepositories>["gameEvents"]
          ],
      },
    ),
  }),
);
vi.mock("@/lib/utils/database/operation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/utils/database/operation.server")
  >()),
  withDatabasePreparation: (execute: () => Promise<unknown>) => execute(),
  withDatabaseOperation: (execute: () => Promise<unknown>) => {
    const fixtures = getFixtureRepositories();
    return fixtures.transaction ? fixtures.transaction(execute) : execute();
  },
}));
