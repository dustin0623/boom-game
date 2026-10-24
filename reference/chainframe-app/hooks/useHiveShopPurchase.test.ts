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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HookHarness } from "@/tests/helpers/hook-harness";
import type { HiveShopOutcome } from "@/features/types/game/payments";

const mocks = vi.hoisted(() => ({
  purchase: vi.fn(),
  state: { address: "alice", mode: "wallet", connectedAt: 1 },
}));
let scope: HookHarness;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (...args: Parameters<HookHarness["useCallback"]>) =>
    scope.useCallback(...args),
  useState: (...args: Parameters<HookHarness["useState"]>) =>
    scope.useState(...args),
  useRef: (...args: Parameters<HookHarness["useRef"]>) => scope.useRef(...args),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (fn: (state: typeof mocks.state) => unknown) => fn(mocks.state),
    { getState: () => ({ ...mocks.state }) },
  ),
}));
vi.mock("@/features/events/frontend/purchase-hive-shop/client", () => ({
  purchaseHiveShop: mocks.purchase,
}));
import { useHiveShopPurchase } from "./useHiveShopPurchase";

const order = {
  kind: "chest" as const,
  itemId: "equipment",
  quantity: 1,
  hiveAmount: 10,
};
const deferred = () => {
  let resolve!: (value: HiveShopOutcome) => void;
  const promise = new Promise<HiveShopOutcome>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const render = () => scope.render(() => useHiveShopPurchase());
beforeEach(() => {
  vi.clearAllMocks();
  scope = new HookHarness();
  mocks.state = { address: "alice", mode: "wallet", connectedAt: 1 };
});
afterEach(() => scope.unmount());

describe("HIVE shop purchase UI lifecycle", () => {
  it("shows feature phases and resets to idle after completion", async () => {
    const result = deferred();
    mocks.purchase.mockImplementation((_order, context) => {
      context.onPhase("awaiting-keychain-approval");
      return result.promise;
    });
    const payment = render().buy(order);
    expect(render()).toMatchObject({
      phase: "awaiting-keychain-approval",
      busy: true,
    });
    const callbacks = mocks.purchase.mock.calls[0][1];
    callbacks.onPhase("confirming-onchain");
    expect(render()).toMatchObject({ phase: "confirming-onchain", busy: true });
    result.resolve({ ok: true });
    expect(await payment).toEqual({ ok: true });
    expect(render()).toMatchObject({ phase: "idle", busy: false });
  });
  it("blocks overlapping calls before requesting another workflow", async () => {
    const result = deferred();
    mocks.purchase.mockReturnValue(result.promise);
    const hook = render();
    const first = hook.buy(order);
    expect(await hook.buy(order)).toEqual({
      ok: false,
      error: "A purchase is already in progress",
    });
    expect(mocks.purchase).toHaveBeenCalledOnce();
    result.resolve({ ok: true });
    await first;
  });
  it.each(["logout", "switch", "same-account reconnect"])(
    "discards old phase callbacks and visible busy state after %s",
    async (change) => {
      const result = deferred();
      mocks.purchase.mockImplementation((_order, context) => {
        context.onPhase("confirming-onchain");
        return result.promise;
      });
      const payment = render().buy(order);
      const callbacks = mocks.purchase.mock.calls[0][1];
      if (change === "logout")
        mocks.state = { address: "", mode: "guest", connectedAt: 2 };
      else
        mocks.state = {
          ...mocks.state,
          address: change === "switch" ? "bob" : "alice",
          connectedAt: 2,
        };
      expect(callbacks.isCurrent()).toBe(false);
      expect(render()).toMatchObject({ phase: "idle", busy: false });
      callbacks.onPhase("awaiting-keychain-approval");
      result.resolve({
        ok: false,
        error: "Wallet session changed; payment may still settle",
      });
      await payment;
      expect(render()).toMatchObject({ phase: "idle", busy: false });
    },
  );
  it("prevents an old completion from resetting a new session's active phase", async () => {
    const old = deferred();
    const next = deferred();
    mocks.purchase
      .mockImplementationOnce((_order, context) => {
        context.onPhase("confirming-onchain");
        return old.promise;
      })
      .mockImplementationOnce((_order, context) => {
        context.onPhase("awaiting-keychain-approval");
        return next.promise;
      });
    const oldPayment = render().buy(order);
    mocks.state.connectedAt = 2;
    const newPayment = render().buy(order);
    old.resolve({ ok: false, error: "Wallet session changed" });
    await oldPayment;
    expect(render()).toMatchObject({
      phase: "awaiting-keychain-approval",
      busy: true,
    });
    next.resolve({ ok: true });
    await newPayment;
    expect(render()).toMatchObject({ phase: "idle", busy: false });
  });
  it("does not start a workflow without a wallet session", async () => {
    mocks.state.mode = "guest";
    expect(await render().buy(order)).toEqual({
      ok: false,
      error: "Connect your wallet first",
    });
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
});
