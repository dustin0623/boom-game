import { useTransactionStore } from "@/features/stores/transactionStore";
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
import type {
  HiveShopOrder,
  PaymentPhase,
} from "@/features/types/game/payments";

const mocks = vi.hoisted(() => ({ transfer: vi.fn(), confirmation: vi.fn() }));
vi.mock("@/lib/utils/hive/wallet", () => ({
  getHiveTreasuryAccount: () => "treasury",
}));
vi.mock(
  "@/lib/chains/modules/hive/wallet/events/transfer-native/action",
  () => ({ transferNative: mocks.transfer }),
);
vi.mock(
  "@/features/events/frontend/confirm-transaction/client",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/events/frontend/confirm-transaction/client")
    >()),
    waitForTransaction: mocks.confirmation,
  }),
);
import { purchaseHiveShop } from "./client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";

const order: HiveShopOrder = {
  kind: "chest",
  itemId: "equipment",
  quantity: 1,
  hiveAmount: 10,
};
let current: {
  address: string | null;
  mode: string | null;
  connectedAt: number | null;
};
const context = () => {
  const session = { ...current };
  return {
    session,
    isCurrent: () =>
      current.address === session.address &&
      current.mode === session.mode &&
      current.connectedAt === session.connectedAt,
    onPhase: vi.fn<(phase: PaymentPhase) => void>(),
  };
};
const replaceSession = (change: string) => {
  if (change === "logout")
    current = { address: null, mode: null, connectedAt: null };
  else
    current = {
      ...current,
      address: change === "switch" ? "bob" : "alice",
      connectedAt: 2,
    };
};
const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};

beforeEach(() => {
  useTransactionStore.getState().begin(null);
  vi.clearAllMocks();
  current = { address: "alice", mode: "wallet", connectedAt: 1 };
  mocks.transfer.mockResolvedValue({ transactionId: "transaction1" });
  mocks.confirmation.mockResolvedValue({ receipt: { metadata: {} } });
});

describe("HIVE shop payment and receipt workflow", () => {
  it("does not pay when the worker preflight fails", async () => {
    vi.mocked(requireWorkerReadiness).mockRejectedValueOnce(
      Error("Game processing is unavailable"),
    );
    expect(await purchaseHiveShop(order, context())).toEqual({
      ok: false,
      error: "Game processing is unavailable",
    });
    expect(mocks.transfer).not.toHaveBeenCalled();
    expect(mocks.confirmation).not.toHaveBeenCalled();
  });
  it("serializes tenths as native three-decimal amounts with the existing memo envelope", async () => {
    await purchaseHiveShop(
      { kind: "consumable", itemId: "help-kit", quantity: 3, hiveAmount: 0.3 },
      context(),
    );
    expect(mocks.transfer).toHaveBeenCalledWith({
      username: "alice",
      account: "treasury",
      amount: "0.300",
      symbol: "HIVE",
      action: "shop_purchase",
      metadata: { kind: "consumable", itemId: "help-kit", quantity: 3 },
    });
  });
  it("refuses finer-precision amounts before requesting a payment", async () => {
    expect(
      await purchaseHiveShop({ ...order, hiveAmount: 0.1001 }, context()),
    ).toEqual({ ok: false, error: "Invalid amount" });
    expect(mocks.transfer).not.toHaveBeenCalled();
    expect(mocks.confirmation).not.toHaveBeenCalled();
  });
  it("subscribes immediately and publishes phases without reporting a minted reward", async () => {
    const callbacks = context();
    mocks.confirmation.mockResolvedValue({
      receipt: { metadata: { shopItemId: "equipment", shopQuantity: 1 } },
    });
    expect(await purchaseHiveShop(order, callbacks)).toEqual({
      ok: true,
    });
    expect(callbacks.onPhase.mock.calls.map(([phase]) => phase)).toEqual([
      "awaiting-keychain-approval",
      "confirming-onchain",
    ]);
    expect(mocks.transfer).toHaveBeenCalledOnce();
    expect(mocks.confirmation).toHaveBeenCalledWith(
      "transaction1",
      callbacks.session,
      { type: "shop_purchase" },
    );
  });
  it("does not infer a minted reward from an unrelated chest log", async () => {
    mocks.confirmation.mockResolvedValue({
      receipt: { metadata: {} },
      log: { type: "chest", data: { itemId: "item-from-log" } },
    });
    expect(await purchaseHiveShop(order, context())).toEqual({
      ok: true,
    });
  });
  it("waits for delayed receipts without a second payment", async () => {
    let resolve!: (value: unknown) => void;
    mocks.confirmation.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let completed = false;
    const payment = purchaseHiveShop(order, context()).then((result) => {
      completed = true;
      return result;
    });
    await flush();
    expect(mocks.confirmation).toHaveBeenCalledOnce();
    expect(mocks.transfer).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
    resolve({ receipt: { metadata: {} } });
    expect(await payment).toEqual({ ok: true });
    expect(mocks.transfer).toHaveBeenCalledOnce();
  });
  it("reports settlement rejection", async () => {
    mocks.confirmation.mockRejectedValue(new Error("Wrong amount"));
    expect(await purchaseHiveShop(order, context())).toEqual({
      ok: false,
      error: "Wrong amount",
    });
  });
  it.each([
    "Cancelled",
    "Broadcast failed",
    "Broadcast submitted without a transaction id",
  ])("preserves %s without subscribing or retrying", async (message) => {
    mocks.transfer.mockRejectedValue(new Error(message));
    expect(await purchaseHiveShop(order, context())).toEqual({
      ok: false,
      error: message,
    });
    expect(mocks.transfer).toHaveBeenCalledOnce();
    expect(mocks.confirmation).not.toHaveBeenCalled();
  });
  it("keeps confirmation timeout uncertain without resubmitting payment", async () => {
    mocks.confirmation.mockRejectedValue(
      new Error("Still awaiting processing"),
    );
    expect(await purchaseHiveShop(order, context())).toEqual({
      ok: false,
      error: "Still awaiting processing",
    });
    expect(mocks.transfer).toHaveBeenCalledOnce();
    expect(mocks.confirmation).toHaveBeenCalledOnce();
  });
  it.each(["logout", "switch", "same-account reconnect"])(
    "ignores broadcast completion after %s",
    async (change) => {
      const callbacks = context();
      mocks.transfer.mockImplementation(async () => {
        replaceSession(change);
        return { transactionId: "transaction1" };
      });
      expect(await purchaseHiveShop(order, callbacks)).toEqual({
        ok: false,
        error: "Wallet session changed; payment may still settle",
      });
      expect(mocks.confirmation).not.toHaveBeenCalled();
    },
  );
  it.each(["logout", "switch", "same-account reconnect"])(
    "ignores confirmation completion after %s",
    async (change) => {
      const callbacks = context();
      mocks.confirmation.mockImplementation(async () => {
        replaceSession(change);
        return {
          receipt: { metadata: { shopItemId: "equipment", shopQuantity: 1 } },
        };
      });
      expect(await purchaseHiveShop(order, callbacks)).toEqual({
        ok: false,
        error: "Wallet session changed; payment may still settle",
      });
      expect(mocks.transfer).toHaveBeenCalledOnce();
    },
  );
  it("requires the captured wallet session before requesting payment", async () => {
    current.mode = "guest";
    expect(await purchaseHiveShop(order, context())).toEqual({
      ok: false,
      error: "Connect your wallet first",
    });
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
});
