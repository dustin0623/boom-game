vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: vi.fn(async (current: () => boolean) => {
    if (!current()) throw new Error("Wallet session changed before signing");
  }),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: Object.assign(
    (selector: (state: { available: boolean }) => unknown) =>
      selector({ available: true }),
    { getState: () => ({ available: true, set: vi.fn() }) },
  ),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const transfer = vi.hoisted(() => vi.fn());
vi.mock(
  "@/lib/chains/modules/hive/wallet/events/transfer-token/action",
  () => ({ transferToken: transfer }),
);
vi.mock(
  "@/lib/chains/modules/hive/wallet/events/transfer-native/action",
  () => ({ transferNative: transfer }),
);
vi.mock("@/lib/utils/hive/wallet", () => ({
  getHiveMarketAccount: () => "market",
  getHiveTreasuryAccount: () => "treasury",
}));
import { purchaseMarketItem } from "./client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { depositHash } from "@/features/events/frontend/deposit-hash/client";
import { useTransactionStore } from "@/features/stores/transactionStore";
import { PaymentBroadcastUncertain } from "@/lib/utils/hive/payment";
const session = { address: "alice", mode: "wallet", connectedAt: 1 };
const auth = vi.hoisted(() => ({
  address: "alice",
  mode: "wallet",
  connectedAt: 1,
  apiConnected: true,
  isRegistered: true as boolean | null,
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: { getState: () => auth },
}));
beforeEach(() => {
  Object.assign(auth, {
    address: "alice",
    mode: "wallet",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  });
  useTransactionStore.getState().begin(null);
  vi.resetAllMocks();
  transfer.mockResolvedValue({ transactionId: "payment" });
});
describe("native HIVE marketplace price validation", () => {
  it.each([false, null])(
    "does not sign with registration %s",
    async (registered) => {
      auth.isRegistered = registered;
      await expect(
        purchaseMarketItem("item", 1, { session, isCurrent: () => true }),
      ).rejects.toThrow("Player registration is required");
      expect(transfer).not.toHaveBeenCalled();
      expect(requireWorkerReadiness).not.toHaveBeenCalled();
      expect(useTransactionStore.getState().submitted).toEqual([]);
    },
  );
  it("rechecks registration and session after preflight", async () => {
    vi.mocked(requireWorkerReadiness).mockImplementationOnce(async () => {
      auth.isRegistered = false;
    });
    await expect(
      purchaseMarketItem("item", 1, { session, isCurrent: () => true }),
    ).rejects.toThrow("registration");
    expect(transfer).not.toHaveBeenCalled();
    auth.isRegistered = true;
    vi.mocked(requireWorkerReadiness).mockImplementationOnce(async () => {
      auth.connectedAt++;
    });
    await expect(
      purchaseMarketItem("item", 1, { session, isCurrent: () => true }),
    ).rejects.toThrow("session changed");
    expect(transfer).not.toHaveBeenCalled();
  });
  it("preserves milli-HIVE on the wire and submitted label", async () => {
    await purchaseMarketItem("item", 0.101, { session, isCurrent: () => true });
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "market",
        amount: "0.101",
        symbol: "HIVE",
      }),
    );
    expect(useTransactionStore.getState().submitted[0].label).toBe(
      "Buy item · 0.101 HIVE",
    );
  });
  it.each([0.0001, 0.1001, 0, -1, Number.MAX_SAFE_INTEGER])(
    "rejects invalid price %s before preflight or signing",
    async (price) => {
      await expect(
        purchaseMarketItem("item", price, { session, isCurrent: () => true }),
      ).rejects.toThrow("Invalid amount");
      expect(transfer).not.toHaveBeenCalled();
      expect(requireWorkerReadiness).not.toHaveBeenCalled();
      expect(useTransactionStore.getState().submitted).toEqual([]);
    },
  );
});
for (const [name, execute] of [
  [
    "marketplace",
    (context: { session: typeof session; isCurrent: () => boolean }) =>
      purchaseMarketItem("item", 5, context),
  ],
  [
    "deposit",
    (context: { session: typeof session; isCurrent: () => boolean }) =>
      depositHash(5, context),
  ],
] as const)
  describe(name + " payment workflow", () => {
    it("guards an in-flight signature across remounts and releases after the broadcast result", async () => {
      let finish!: (value: { transactionId: string }) => void;
      transfer.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const context = { session, isCurrent: () => true };
      const first = execute(context);
      await Promise.resolve();
      await Promise.resolve();
      await expect(execute(context)).rejects.toThrow(
        "already awaiting Keychain approval",
      );
      expect(transfer).toHaveBeenCalledOnce();
      finish({ transactionId: "first" });
      await first;
      expect(await execute(context)).toEqual({ transactionId: "payment" });
      expect(transfer).toHaveBeenCalledTimes(2);
    });
    it("records a known missing-ID submission and closes its form once", async () => {
      const onSubmitted = vi.fn();
      transfer.mockRejectedValueOnce(new PaymentBroadcastUncertain());
      await expect(
        execute({ session, isCurrent: () => true, onSubmitted } as never),
      ).rejects.toBeInstanceOf(PaymentBroadcastUncertain);
      expect(onSubmitted).toHaveBeenCalledOnce();
      expect(useTransactionStore.getState().submitted).toMatchObject([
        { transactionId: null, status: "unknown" },
      ]);
      expect(transfer).toHaveBeenCalledOnce();
    });
    it("does not register cancelled or stale broadcasts", async () => {
      transfer.mockRejectedValueOnce(Error("Cancelled"));
      await expect(execute({ session, isCurrent: () => true })).rejects.toThrow(
        "Cancelled",
      );
      expect(useTransactionStore.getState().submitted).toEqual([]);
      let current = true;
      transfer.mockImplementationOnce(async () => {
        current = false;
        return { transactionId: "late" };
      });
      expect(await execute({ session, isCurrent: () => current })).toBeNull();
      expect(useTransactionStore.getState().submitted).toEqual([]);
    });
    it("does not request a payment when the worker cannot accept it", async () => {
      vi.mocked(requireWorkerReadiness).mockRejectedValueOnce(
        Error("Game processing is unavailable"),
      );
      await expect(execute({ session, isCurrent: () => true })).rejects.toThrow(
        "unavailable",
      );
      expect(transfer).not.toHaveBeenCalled();
    });
    it("broadcasts once with the existing payment intent", async () => {
      expect(await execute({ session, isCurrent: () => true })).toEqual({
        transactionId: "payment",
      });
      expect(transfer).toHaveBeenCalledTimes(1);
      if (name === "marketplace")
        expect(transfer).toHaveBeenCalledWith({
          username: "alice",
          account: "market",
          symbol: "HIVE",
          amount: "5.000",
          action: "market_purchase",
          metadata: { itemId: "item" },
        });
      else
        expect(transfer).toHaveBeenCalledWith({
          username: "alice",
          account: "treasury",
          symbol: "HASH",
          quantity: "5.000",
          action: "deposit",
          metadata: {},
        });
    });
    it.each([
      "Cancelled",
      "Broadcast failed",
      "Payment submitted without a transaction id. Check Hive history.",
    ])("preserves %s without retrying", async (error) => {
      transfer.mockRejectedValue(new Error(error));
      await expect(execute({ session, isCurrent: () => true })).rejects.toThrow(
        error,
      );
      expect(transfer).toHaveBeenCalledTimes(1);
    });
    it.each(["logout", "account switch", "same-account reconnect"])(
      "discards delayed results after %s",
      async () => {
        let current = true;
        transfer.mockImplementation(async () => {
          current = false;
          return { transactionId: "payment" };
        });
        expect(await execute({ session, isCurrent: () => current })).toBeNull();
        expect(transfer).toHaveBeenCalledTimes(1);
      },
    );
    it("rejects demo sessions before any transfer", async () => {
      await expect(
        execute({
          session: { ...session, mode: "demo" },
          isCurrent: () => true,
        }),
      ).rejects.toThrow("Sign in with Hive Keychain");
      expect(transfer).not.toHaveBeenCalled();
    });
  });
