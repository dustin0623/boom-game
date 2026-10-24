import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  market: vi.fn(),
  shop: vi.fn(),
  registration: vi.fn(),
  deposit: vi.fn(),
  reconciliation: vi.fn(),
  processed: vi.fn(),
  player: vi.fn(),
  item: vi.fn(),
}));
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: {
      marketAccount: "market",
      treasuryAccount: "treasury",
      token: "HASH",
    },
  },
}));
vi.mock("@/lib/modules/players/server.repository", () => ({
  playerRepository: { findOrCreate: calls.player },
}));
vi.mock("@/lib/modules/equipments/server.repository", () => ({
  equipmentRepository: { findById: calls.item },
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  isTransactionProcessed: calls.processed,
}));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  enqueueMarketPurchase: calls.market,
  enqueueShopPurchase: calls.shop,
  enqueueRegistration: calls.registration,
  enqueueDeposit: calls.deposit,
  enqueuePaymentReconciliation: calls.reconciliation,
}));
import { observeHivePayment } from "./intake";
import type { ObservedPayment } from "@/lib/utils/game/hive-activity";
const payment = (): ObservedPayment => ({
  kind: "payment",
  transactionId: "purchase",
  transactionIndex: 0,
  operationIndex: 2,
  blockNumber: 100,
  blockTimestamp: "2026-10-10T00:00:00",
  paymentsInTransaction: 1,
  from: "alice",
  to: "market",
  symbol: "HIVE",
  quantity: "0.101",
  trigger: { action: "market_purchase", metadata: { itemId: "item" } },
});
beforeEach(() => {
  vi.resetAllMocks();
  calls.processed.mockResolvedValue(false);
  calls.item.mockResolvedValue({ slot: "asicMiner" });
});
describe("purpose-specific payment queueing", () => {
  it("durably queues HIVE market identity and recipient without settling it", async () => {
    await observeHivePayment(payment());
    expect(calls.market).toHaveBeenCalledExactlyOnceWith({
      paymentTxId: "purchase",
      walletAddress: "alice",
      paymentOperationIndex: 2,
      itemId: "item",
      itemType: "asicMiner",
      price: 0.101,
      paymentCurrency: "HIVE",
      paymentAccount: "market",
      feeTreasuryAccount: "treasury",
    });
    expect(calls.player).not.toHaveBeenCalled();
  });
  it.each([
    { to: "treasury" },
    { to: "other" },
    { symbol: "HASH" },
    { symbol: "HBD" },
  ])(
    "rejects wrong marketplace routing %j before any queue or item lookup",
    async (change) => {
      await expect(
        observeHivePayment({ ...payment(), ...change }),
      ).rejects.toThrow(/Wrong payment/);
      expect(calls.market).not.toHaveBeenCalled();
      expect(calls.item).not.toHaveBeenCalled();
      expect(calls.player).not.toHaveBeenCalled();
    },
  );
  it("retains treasury routing for native shop purchases", async () => {
    await observeHivePayment({
      ...payment(),
      to: "treasury",
      quantity: "0.300",
      trigger: {
        action: "shop_purchase",
        metadata: { kind: "consumable", itemId: "help-kit", quantity: 3 },
      },
    });
    expect(calls.shop).toHaveBeenCalledWith(
      expect.objectContaining({
        shopHiveAmount: 0.3,
        paymentOperationIndex: 2,
      }),
    );
    expect(calls.market).not.toHaveBeenCalled();
  });
  it("retains HASH treasury deposits", async () => {
    await observeHivePayment({
      ...payment(),
      to: "treasury",
      symbol: "HASH",
      quantity: "5.000",
      trigger: { action: "deposit", metadata: {} },
    });
    expect(calls.deposit).toHaveBeenCalledWith(
      expect.objectContaining({ depositAmount: 5 }),
    );
    expect(calls.market).not.toHaveBeenCalled();
  });
  it("propagates a durable queue failure so intake cannot advance", async () => {
    calls.market.mockRejectedValue(Error("Queue unavailable"));
    await expect(observeHivePayment(payment())).rejects.toThrow(
      "Queue unavailable",
    );
  });
  it("does not queue a replay already covered by a receipt", async () => {
    calls.processed.mockResolvedValue(true);
    await observeHivePayment(payment());
    expect(calls.market).not.toHaveBeenCalled();
    expect(calls.item).not.toHaveBeenCalled();
  });
});
