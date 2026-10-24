import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  wallet: "alice" as string | null,
  mode: "wallet" as string,
  connectedAt: 1,
  isRegistered: true,
  effect: undefined as undefined | (() => void | (() => void)),
}));
const calls = vi.hoisted(() => ({
  logs: vi.fn(),
  transactions: vi.fn(),
  clear: vi.fn(),
  push: vi.fn(),
  player: vi.fn(),
  equipment: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => {
    state.effect = effect;
  },
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (value: unknown) => unknown) =>
      selector({
        address: state.wallet,
        mode: state.mode,
        connectedAt: state.connectedAt,
        isRegistered: state.isRegistered,
      }),
    {
      getState: () => ({
        address: state.wallet,
        mode: state.mode,
        connectedAt: state.connectedAt,
        isRegistered: state.isRegistered,
      }),
    },
  ),
}));
vi.mock("@/features/stores/notificationStore", () => ({
  useNotificationStore: {
    getState: () => ({ clear: calls.clear, push: calls.push }),
  },
}));
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: { getState: () => ({ syncFromApi: calls.player }) },
}));
vi.mock("@/features/stores/inventoryStore", () => ({
  useInventoryStore: { getState: () => ({ syncFromApi: calls.equipment }) },
}));
vi.mock("@/lib/api/client", () => ({
  getActivityLogs: calls.logs,
  getTransactions: calls.transactions,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
import { usePersonalHistory } from "./usePersonalHistory";
import { toast } from "sonner";
import { useTransactionStore } from "@/features/stores/transactionStore";
let win: EventTarget,
  doc: EventTarget & { visibilityState: string },
  cleanup: (() => void) | void;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  state.wallet = "alice";
  state.mode = "wallet";
  state.connectedAt = 1;
  state.isRegistered = true;
  useTransactionStore.getState().begin(null);
  win = new EventTarget();
  Object.assign(win, { setInterval, clearInterval });
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  calls.logs.mockResolvedValue({ ok: true, logs: [], nextCursor: null });
  calls.transactions.mockResolvedValue({
    ok: true,
    pending: [],
    history: [],
    nextCursor: null,
  });
  calls.player.mockResolvedValue(true);
  calls.equipment.mockResolvedValue(true);
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const start = (enabled = true) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- useEffect is mocked by this lifecycle harness.
  usePersonalHistory(enabled);
  cleanup = state.effect?.();
};
describe("history polling lifecycle", () => {
  it.each(["logout", "switch", "reconnect"])(
    "discards a late purchase toast after %s",
    async (change) => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      let finish!: (value: unknown) => void;
      calls.logs.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      await vi.advanceTimersByTimeAsync(5000);
      if (change === "logout") {
        state.mode = "guest";
        state.wallet = null;
      } else if (change === "switch") state.wallet = "bob";
      else state.connectedAt++;
      finish({
        ok: true,
        logs: [
          {
            id: "late-purchase",
            type: "shop",
            wallet: "alice",
            createdAt: 1,
            amount: 0,
            data: {
              itemId: "help-kit",
              quantity: 5,
              paidWith: "hive",
              hiveAmount: 0.5,
            },
          },
        ],
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      expect(calls.push).not.toHaveBeenCalled();
    },
  );
  it("sends the recorded consumable purchase to one success toast and the same Recent history message", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(toast.success).not.toHaveBeenCalled();
    calls.logs.mockResolvedValue({
      ok: true,
      logs: [
        {
          id: "purchase",
          type: "shop",
          wallet: "alice",
          createdAt: 1,
          amount: 0,
          correlationKey: "purchase:0",
          data: {
            itemId: "help-kit",
            quantity: 5,
            paidWith: "hive",
            hiveAmount: 0.5,
          },
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Purchased 5 Help Kits — spent 0.5 HIVE",
    );
    expect(calls.push).toHaveBeenCalledWith(
      "Purchased 5 Help Kits — spent 0.5 HIVE",
      "success",
      undefined,
      expect.objectContaining({ id: "log:purchase" }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each([
    ["registration", { action: "refunded" }, "Registration refund: 5 HIVE"],
    ["withdrawal", { refunded: true }, "Withdrawal compensated: 5 HASH"],
    [
      "game_action",
      { action: "request_withdrawal" },
      "Withdrawal queued — payment is not yet confirmed",
    ],
  ])(
    "uses an informational toast for %s outcomes",
    async (type, data, message) => {
      start();
      await vi.advanceTimersByTimeAsync(0);
      calls.logs.mockResolvedValue({
        ok: true,
        logs: [
          {
            id: "outcome",
            type,
            wallet: "alice",
            amount: 5,
            data,
            createdAt: 1,
          },
        ],
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(toast).toHaveBeenCalledExactlyOnceWith(message);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );
  it("polls every five seconds, pauses hidden pages, resumes on visibility and focus", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.logs).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.logs).toHaveBeenCalledTimes(2);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.logs).toHaveBeenCalledTimes(2);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.logs).toHaveBeenCalledTimes(3);
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.logs).toHaveBeenCalledTimes(4);
  });
  it("cleans up listeners and timers on unmount", async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    cleanup?.();
    cleanup = undefined;
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(15000);
    expect(calls.logs).toHaveBeenCalledTimes(1);
  });
  it("makes no authoritative requests for disabled guest sessions", async () => {
    state.mode = "guest";
    start(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls.logs).not.toHaveBeenCalled();
    expect(calls.player).not.toHaveBeenCalled();
  });
  it("discards in-flight requests after account changes", async () => {
    let resolve!: (value: unknown) => void;
    calls.logs.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    start();
    state.wallet = "bob";
    resolve({
      ok: true,
      logs: [{ id: "old", type: "claim", wallet: "alice", createdAt: 1 }],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.transactions).not.toHaveBeenCalled();
    expect(calls.push).not.toHaveBeenCalled();
  });
  it("retries failed state refreshes on the next poll", async () => {
    calls.player.mockResolvedValueOnce(false);
    start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.player).toHaveBeenCalledTimes(2);
  });
  it("ignores delayed history after reconnecting to the same wallet", async () => {
    let resolve!: (value: unknown) => void;
    calls.logs.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    start();
    state.connectedAt = 2;
    resolve({ ok: true, logs: [{ id: "old", type: "claim" }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.transactions).not.toHaveBeenCalled();
    expect(calls.push).not.toHaveBeenCalled();
    expect(useTransactionStore.getState().refreshed).toBe(false);
  });
  it("does not mark a stopped session ready after delayed refreshes", async () => {
    let resolve!: (value: boolean) => void;
    calls.equipment.mockReturnValueOnce(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    start();
    await vi.advanceTimersByTimeAsync(0);
    cleanup?.();
    cleanup = undefined;
    resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(useTransactionStore.getState().refreshed).toBe(false);
  });
});
