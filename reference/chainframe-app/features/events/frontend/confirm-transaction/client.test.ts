import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  state: { address: "alice", mode: "wallet", connectedAt: 1 },
  listeners: new Set<() => void>(),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: {
    getState: () => auth.state,
    subscribe: (fn: () => void) => {
      auth.listeners.add(fn);
      return () => auth.listeners.delete(fn);
    },
  },
}));
import {
  waitForTransaction,
  recordSubmittedTransaction,
  reconcileSubmittedTransactions,
  claimSubmission,
  releaseSubmission,
} from "./client";
import {
  useTransactionStore,
  transactionSessionKey,
} from "@/features/stores/transactionStore";
import type { LogDto, SettledTxDto } from "@/lib/api/types";
let doc: EventTarget & { visibilityState: string };
const receipt = (overrides: Partial<SettledTxDto> = {}): SettledTxDto => ({
  id: "id",
  type: "game_action",
  transactionId: "tx",
  operationIndex: 0,
  txHash: "tx:0",
  status: "success",
  error: null,
  amount: 0,
  processedAt: 1,
  metadata: null,
  ...overrides,
});
const publish = (
  tx: SettledTxDto = receipt(),
  logs: LogDto[] = [],
  ready = true,
) => {
  const key = transactionSessionKey(auth.state)!;
  useTransactionStore.getState().observe(key, logs, [tx], []);
  if (ready) useTransactionStore.getState().ready(key, false);
};
beforeEach(() => {
  vi.useFakeTimers();
  auth.state = { address: "alice", mode: "wallet", connectedAt: 1 };
  auth.listeners.clear();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", doc);
  useTransactionStore.getState().begin(null);
  useTransactionStore.getState().begin(transactionSessionKey(auth.state));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("personal receipt confirmation", () => {
  it("keeps a timed-out broadcast delayed until later authoritative confirmation", async () => {
    recordSubmittedTransaction(
      { session: auth.state, isCurrent: () => true },
      {
        kind: "game",
        label: "Claim",
        transactionId: "tx",
        type: "game_action",
      },
    );
    const waiting = waitForTransaction("tx", auth.state);
    const rejection = expect(waiting).rejects.toThrow(
      "Still awaiting processing",
    );
    await vi.advanceTimersByTimeAsync(180000);
    await rejection;
    expect(useTransactionStore.getState().submitted).toMatchObject([
      { status: "delayed" },
    ]);
    publish();
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toEqual([]);
  });
  it("tracks local broadcasts without generating database pending jobs", () => {
    recordSubmittedTransaction(
      { session: auth.state, isCurrent: () => true },
      {
        kind: "game",
        label: "Claim vault",
        transactionId: "tx",
        type: "game_action",
      },
    );
    expect(useTransactionStore.getState().submitted).toMatchObject([
      { label: "Claim vault", transactionId: "tx", status: "submitted" },
    ]);
    expect(useTransactionStore.getState().pending).toEqual([]);
    expect(useTransactionStore.getState().receipts).toEqual({});
  });
  it("keeps missing-ID submissions uncertain despite unrelated receipts", () => {
    recordSubmittedTransaction(
      { session: auth.state, isCurrent: () => true },
      {
        kind: "payment",
        label: "Deposit 5 HASH",
        transactionId: null,
        type: "deposit",
      },
    );
    publish(receipt({ type: "deposit" }));
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toMatchObject([
      { transactionId: null, status: "unknown" },
    ]);
  });
  it("uses exact receipt identity and retains submissions until required refresh and logs", () => {
    recordSubmittedTransaction(
      { session: auth.state, isCurrent: () => true },
      {
        kind: "game",
        label: "Claim",
        transactionId: "tx",
        type: "game_action",
        operationIndex: 1,
        requireLog: "claim",
      },
    );
    publish();
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    publish(receipt({ operationIndex: 1, txHash: "tx:1" }), [], false);
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    publish(receipt({ operationIndex: 1, txHash: "tx:1" }), [
      { id: "log", type: "claim", correlationKey: "tx:1" } as LogDto,
    ]);
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toEqual([]);
  });
  it("reconciles fast cached receipts and never creates completion notifications", () => {
    publish();
    recordSubmittedTransaction(
      { session: auth.state, isCurrent: () => true },
      {
        kind: "game",
        label: "Claim",
        transactionId: "tx",
        type: "game_action",
      },
    );
    expect(useTransactionStore.getState().submitted).toEqual([]);
    expect(useTransactionStore.getState().latestSubmissionId).not.toBeNull();
  });
  it("releases action-scoped guards only after a terminal outcome", () => {
    const context = { session: auth.state, isCurrent: () => true };
    const lock = claimSubmission(context, "equip:item1")!;
    recordSubmittedTransaction(
      context,
      {
        kind: "game",
        label: "Equip",
        transactionId: "tx",
        type: "game_action",
      },
      lock,
    );
    expect(claimSubmission(context, "equip:item1")).toBeNull();
    expect(claimSubmission(context, "equip:item2")).not.toBeNull();
    publish(receipt({ status: "failed", error: "Cannot equip" }), [], false);
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toEqual([]);
    expect(claimSubmission(context, "equip:item1")).not.toBeNull();
  });
  it("clears broadcast state and guards on a new session and rejects late writes", () => {
    const context = { session: { ...auth.state }, isCurrent: () => false };
    recordSubmittedTransaction(
      { ...context, isCurrent: () => true },
      {
        kind: "payment",
        label: "Register",
        transactionId: "tx",
        type: "registration",
      },
    );
    auth.state.connectedAt = 2;
    useTransactionStore.getState().begin(transactionSessionKey(auth.state));
    expect(
      recordSubmittedTransaction(context, {
        kind: "game",
        label: "Old",
        transactionId: "late",
        type: "game_action",
      }),
    ).toBeNull();
    expect(useTransactionStore.getState().submitted).toEqual([]);
    expect(useTransactionStore.getState().registrationSubmitted).toBe(false);
  });
  it("does not evict unresolved submissions and releases an unsubmitted signing guard", () => {
    const context = { session: auth.state, isCurrent: () => true };
    const lock = claimSubmission(context, "signing")!;
    releaseSubmission(lock);
    expect(claimSubmission(context, "signing")).not.toBeNull();
    for (let n = 0; n < 60; n++)
      recordSubmittedTransaction(context, {
        kind: "game",
        label: "Action",
        transactionId: "tx" + n,
        type: "game_action",
      });
    expect(useTransactionStore.getState().submitted).toHaveLength(60);
  });
  it("requires authoritative registration readiness and keeps the dismissal marker afterward", () => {
    recordSubmittedTransaction(
      { session: auth.state, isCurrent: () => true },
      {
        kind: "payment",
        label: "Register",
        transactionId: "tx",
        type: "registration",
        registered: true,
      },
    );
    publish(receipt({ type: "registration" }));
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toHaveLength(1);
    useTransactionStore
      .getState()
      .ready(transactionSessionKey(auth.state)!, true);
    reconcileSubmittedTransactions(auth.state);
    expect(useTransactionStore.getState().submitted).toEqual([]);
    expect(useTransactionStore.getState().registrationSubmitted).toBe(true);
  });
  it("uses a receipt already seen during initial hydration", async () => {
    publish();
    expect((await waitForTransaction("tx", auth.state)).receipt.status).toBe(
      "success",
    );
  });
  it("matches operation index without accepting another action", async () => {
    const waiting = waitForTransaction("tx", auth.state, { operationIndex: 1 });
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    publish();
    await Promise.resolve();
    expect(settled).toBe(false);
    publish(receipt({ operationIndex: 1, txHash: "tx:1" }));
    expect((await waiting).receipt.operationIndex).toBe(1);
  });
  it("waits for authoritative state refresh", async () => {
    const waiting = waitForTransaction("tx", auth.state);
    publish(receipt(), [], false);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    useTransactionStore
      .getState()
      .ready(transactionSessionKey(auth.state)!, false);
    await waiting;
  });
  it("rejects failed receipts immediately", async () => {
    const waiting = expect(
      waitForTransaction("tx", auth.state),
    ).rejects.toThrow("Rejected");
    publish(receipt({ status: "failed", error: "Rejected" }), [], false);
    await waiting;
  });
  it("preserves claim amount from its correlated log", async () => {
    const waiting = waitForTransaction("tx", auth.state, {
      requireLog: "claim",
    });
    publish();
    publish(receipt(), [
      {
        id: "log",
        type: "claim",
        wallet: "alice",
        amount: 42,
        correlationKey: "tx:0",
        createdAt: 1,
      },
    ]);
    expect((await waiting).log?.amount).toBe(42);
  });
  it("deduplicates without preventing multiple consumers", async () => {
    const first = waitForTransaction("tx", auth.state),
      second = waitForTransaction("tx", auth.state);
    publish();
    await Promise.all([first, second]);
    publish();
    expect(Object.keys(useTransactionStore.getState().receipts)).toHaveLength(
      1,
    );
  });
  it.each(["logout", "switch", "reconnect"])(
    "cancels on %s",
    async (change) => {
      const waiting = expect(
        waitForTransaction("tx", auth.state),
      ).rejects.toThrow("Wallet session changed");
      auth.state = {
        address: change === "switch" ? "bob" : "alice",
        mode: change === "logout" ? "" : "wallet",
        connectedAt: 2,
      };
      for (const fn of auth.listeners) fn();
      await waiting;
    },
  );
  it("counts only visible time and retains late receipts", async () => {
    const waiting = expect(
      waitForTransaction("tx", auth.state),
    ).rejects.toThrow("Still awaiting processing for tx");
    await vi.advanceTimersByTimeAsync(60000);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(600000);
    expect(auth.listeners.size).toBe(1);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120000);
    await waiting;
    publish();
    expect((await waitForTransaction("tx", auth.state)).receipt.status).toBe(
      "success",
    );
  });
  it("matches a financial payment operation and type", async () => {
    const waiting = waitForTransaction("tx", auth.state, {
      type: "shop_purchase",
      operationIndex: 2,
    });
    publish(
      receipt({
        type: "shop_purchase",
        transactionId: "tx",
        operationIndex: 2,
        txHash: "tx",
      }),
    );
    expect((await waiting).receipt.type).toBe("shop_purchase");
  });
  it("requires authoritative registration after receipt", async () => {
    const waiting = waitForTransaction("tx", auth.state, {
      type: "registration",
      registered: true,
    });
    publish(receipt({ type: "registration" }));
    useTransactionStore
      .getState()
      .ready(transactionSessionKey(auth.state)!, true);
    await waiting;
  });
  it("cancels aborted consumers without removing receipts", async () => {
    const controller = new AbortController();
    const waiting = expect(
      waitForTransaction("tx", auth.state, { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    controller.abort();
    await waiting;
    expect(auth.listeners.size).toBe(0);
  });
});
