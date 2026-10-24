import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  receipt: vi.fn(),
  insert: vi.fn(),
  mark: vi.fn(),
  log: vi.fn(),
  errorLog: vi.fn(),
  load: vi.fn(),
  check: vi.fn(),
  order: [] as string[],
}));
vi.mock(
  "@/server/game-smart-contract/features/events/treasury/dispatch",
  () => ({
    dispatchTreasuryTransfer: state.dispatch,
  }),
);
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  markJobRefunded: state.mark,
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  getProcessedTransaction: state.receipt,
  insertProcessedTransaction: state.insert,
}));
vi.mock("@/lib/modules/logs/server.repository", () => ({
  createLog: state.log,
  createErrorLog: state.errorLog,
}));
vi.mock("./support", () => ({
  withPaymentDatabaseOperation: async (
    _job: unknown,
    execute: () => Promise<void>,
  ) => execute(),
  loadTreasuryTransfers: state.load,
  message: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));
import { refundNativePayment } from "./refund-native";
import {
  TreasuryPendingError,
  SettlementUncertainError,
} from "@/server/game-smart-contract/features/events/treasury/errors.server";
const context = { checkLease: state.check, maxRetries: 8 };
const job = (type: "registration" | "shop_purchase", extra = {}) =>
  ({
    _id: "job",
    type,
    walletAddress: "alice",
    signature: "payment",
    paymentOperationIndex: 2,
    ...extra,
  }) as unknown as IInboundTransaction;
beforeEach(() => {
  vi.resetAllMocks();
  state.order = [];
  state.dispatch.mockResolvedValue({
    status: "confirmed",
    success: true,
    transactionId: "refund-tx",
  });
  state.receipt.mockResolvedValue(null);
  state.load.mockResolvedValue([{ key: "private-transfer" }]);
  state.log.mockImplementation(async () => {
    state.order.push("log");
  });
  state.mark.mockImplementation(async () => {
    state.order.push("mark");
  });
  state.check.mockImplementation(async () => {
    state.order.push("lease");
  });
  state.insert.mockImplementation(async () => {
    state.order.push("receipt");
  });
});
describe("native registration/shop refund workflow", () => {
  it.each(["registration", "shop_purchase"] as const)(
    "preserves %s identities, memo bytes and write order",
    async (type) => {
      const registration = type === "registration";
      const pending = job(type, {
        depositTxId: "registration-in",
        paymentTxId: "shop-in",
        registrationHiveAmount: 100,
        shopHiveAmount: 0.3,
        shopKind: "consumable",
        shopItemId: "help-kit",
        shopQuantity: 3,
      });
      await refundNativePayment(context, pending, 0.3, "wrong amount");
      const ref = registration ? "registration-in" : "shop-in";
      expect(state.dispatch).toHaveBeenCalledWith(
        context,
        "payment",
        `${registration ? "refundRegistration" : "refundShopPurchase"}:payment`,
        "alice",
        "0.300",
        "HIVE",
        `Chainframe ${registration ? "registration" : "shop"} refund ${ref}`,
      );
      expect(state.order).toEqual(["log", "mark", "lease", "receipt"]);
      expect(state.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          txHash: `refund:${ref}`,
          type,
          metadata: expect.objectContaining({
            type,
            paymentOperationIndex: 2,
            treasuryTransfers: [{ key: "private-transfer" }],
          }),
        }),
      );
      expect(state.insert.mock.calls[0][0].metadata).toMatchObject(
        registration
          ? { registrationHiveAmount: 100, registrationHiveAmountPaid: 0.3 }
          : {
              shopKind: "consumable",
              shopItemId: "help-kit",
              shopQuantity: 3,
              shopHiveAmount: 0.3,
              shopHiveAmountPaid: 0.3,
            },
      );
      expect(pending.refunded).toBe(true);
    },
  );
  it.each([0, -1])(
    "does not broadcast a nonpositive refund",
    async (amount) => {
      await refundNativePayment(context, job("registration"), amount, "reason");
      expect(state.dispatch).not.toHaveBeenCalled();
    },
  );
  it("does not rebroadcast an already-refunded job", async () => {
    await refundNativePayment(
      context,
      job("shop_purchase", { refunded: true }),
      1,
      "reason",
    );
    expect(state.dispatch).not.toHaveBeenCalled();
  });
  it("reuses a durable refund receipt without adding logs or receipts", async () => {
    state.receipt.mockResolvedValue({ txHash: "refund:payment" });
    await refundNativePayment(context, job("registration"), 1, "reason");
    expect(state.mark).toHaveBeenCalledWith("payment");
    expect(state.load).not.toHaveBeenCalled();
    expect(state.log).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("leaves a submitted transfer waiting without database effects or refund error logs", async () => {
    state.dispatch.mockResolvedValue({
      status: "pending",
      success: true,
      transactionId: "submitted",
    });
    const pending = job("registration");
    await expect(
      refundNativePayment(context, pending, 1, "reason"),
    ).rejects.toBeInstanceOf(TreasuryPendingError);
    expect(state.log).not.toHaveBeenCalled();
    expect(state.mark).not.toHaveBeenCalled();
    expect(state.errorLog).not.toHaveBeenCalled();
    expect(pending.refunded).not.toBe(true);
  });
  it.each(["missing-id", "database-write", "broadcast"])(
    "parks %s uncertainty without marking the job complete",
    async (failure) => {
      if (failure === "missing-id")
        state.dispatch.mockResolvedValue({
          status: "confirmed",
          success: true,
        });
      if (failure === "database-write")
        state.insert.mockRejectedValue(new Error("write interrupted"));
      if (failure === "broadcast")
        state.dispatch.mockRejectedValue(
          new SettlementUncertainError("refundShopPurchase:payment"),
        );
      const pending = job("shop_purchase");
      await expect(
        refundNativePayment(context, pending, 1, "reason"),
      ).rejects.toBeInstanceOf(SettlementUncertainError);
      expect(state.dispatch).toHaveBeenCalledOnce();
      expect(pending.refunded).not.toBe(true);
      expect(state.errorLog).toHaveBeenCalledOnce();
    },
  );
  it("does not handle marketplace or withdrawal jobs", async () => {
    const pending = job("registration");
    pending.type = "market_purchase";
    await expect(
      refundNativePayment(context, pending, 1, "reason"),
    ).rejects.toThrow("Unsupported native refund job");
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
