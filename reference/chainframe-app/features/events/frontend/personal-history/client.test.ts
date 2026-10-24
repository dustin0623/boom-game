import { describe, expect, it, vi } from "vitest";
import { createPersonalHistoryPoller } from "./client";
import type { LogDto, SettledTxDto } from "@/lib/api/types";
const log = (id: string, key = id): LogDto => ({
  id,
  type: "claim",
  wallet: "alice",
  amount: 1,
  createdAt: 1,
  correlationKey: key,
});
const tx = (
  key: string,
  status: "success" | "failed" = "success",
): SettledTxDto => ({
  id: key,
  type: "game_action",
  txHash: key,
  amount: 0,
  status,
  error: status === "failed" ? "Rejected" : null,
  processedAt: 1,
  metadata: { action: "claim" },
});
function refreshState() {
  return {
    refreshPlayer: vi.fn().mockResolvedValue(true),
    refreshInventory: vi.fn().mockResolvedValue(true),
    isRefreshed: vi.fn().mockReturnValue(true),
    onReady: vi.fn(),
  };
}
function setup(isCurrent = () => true) {
  const logs = vi
    .fn()
    .mockResolvedValue({ ok: true, logs: [], nextCursor: null });
  const transactions = vi.fn().mockResolvedValue({
    ok: true,
    pending: [],
    history: [],
    nextCursor: null,
  });
  const publish = vi.fn();
  const observe = vi.fn();
  const state = refreshState();
  const poller = createPersonalHistoryPoller({
    wallet: "alice",
    transport: { logs, transactions },
    publish,
    observe,
    isCurrent,
    state,
  });
  return { logs, transactions, publish, observe, state, poller };
}
describe("personal history comparison", () => {
  it("publishes the detailed HIVE purchase once alongside its successful receipt", async () => {
    const s = setup();
    await s.poller.poll();
    s.logs.mockResolvedValue({
      ok: true,
      logs: [
        {
          ...log("purchase", "purchase:0"),
          type: "shop",
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
    s.transactions.mockResolvedValue({
      ok: true,
      history: [{ ...tx("purchase:0"), type: "shop_purchase", metadata: null }],
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toEqual([
      expect.objectContaining({
        message: "Purchased 5 Help Kits — spent 0.5 HIVE",
        kind: "success",
        id: "log:purchase",
      }),
    ]);
    await s.poller.poll();
    expect(s.publish.mock.calls[2][1]).toEqual([]);
    expect(s.observe).toHaveBeenCalledTimes(3);
  });

  it("uses a queued receipt fallback and suppresses a later duplicate announcement", async () => {
    const s = setup();
    await s.poller.poll();
    s.transactions.mockResolvedValueOnce({
      ok: true,
      history: [
        { ...tx("withdraw:0"), metadata: { action: "request_withdrawal" } },
      ],
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toEqual([
      expect.objectContaining({
        message: "Withdrawal queued — payment is not yet confirmed",
        kind: "info",
      }),
    ]);
    s.logs.mockResolvedValue({
      ok: true,
      logs: [
        {
          ...log("queued", "withdraw:0"),
          type: "game_action",
          data: { action: "request_withdrawal" },
        },
      ],
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[2][0]).toHaveLength(1);
    expect(s.publish.mock.calls[2][1]).toEqual([]);
  });

  it("keeps later valid activity usable after malformed optional presentation data", async () => {
    const s = setup();
    await s.poller.poll();
    s.logs.mockResolvedValue({
      ok: true,
      logs: [
        {
          ...log("unsupported"),
          type: "market",
          data: { currency: "unsupported" },
        },
        {
          ...log("chest"),
          type: "chest",
          data: { rarity: "unknown", name: null },
        },
        log("valid"),
      ],
    });
    await s.poller.poll();
    expect(
      s.publish.mock.calls[1][1].map(
        (entry: { message: string }) => entry.message,
      ),
    ).toEqual([
      "Marketplace activity recorded",
      "Opened a chest and found new gear",
      "Claimed 1 HASH from the vault",
    ]);
    expect(s.observe).toHaveBeenCalledTimes(2);
  });
  it("announces pending-to-terminal transitions, including a rejection", async () => {
    const s = setup();
    s.transactions.mockResolvedValueOnce({
      ok: true,
      pending: [{ signature: "tx:0", status: "pending" }],
      history: [],
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[0][1]).toEqual([]);
    s.transactions.mockResolvedValue({
      ok: true,
      pending: [],
      history: [tx("tx:0", "failed")],
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toHaveLength(1);
    expect(s.publish.mock.calls[1][1][0].kind).toBe("danger");
  });
  it("hydrates old history without toasts, then announces new activity only once", async () => {
    const s = setup();
    s.logs.mockResolvedValueOnce({
      ok: true,
      logs: [log("old")],
      latestCursor: "old-cursor",
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[0][1]).toEqual([]);
    s.logs.mockResolvedValue({ ok: true, logs: [log("new")] });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toHaveLength(1);
    await s.poller.poll();
    expect(s.publish.mock.calls[2][1]).toHaveLength(0);
  });
  it("does not toast a receipt and its log twice", async () => {
    const s = setup();
    await s.poller.poll();
    s.logs.mockResolvedValue({ ok: true, logs: [log("entry", "tx:1")] });
    s.transactions.mockResolvedValue({ ok: true, history: [tx("tx:1")] });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toHaveLength(1);
  });
  it("suppresses a delayed log toast after its receipt has already been announced", async () => {
    const s = setup();
    await s.poller.poll();
    s.transactions.mockResolvedValueOnce({ ok: true, history: [tx("tx:0")] });
    await s.poller.poll();
    s.logs.mockResolvedValue({ ok: true, logs: [log("entry", "tx:0")] });
    await s.poller.poll();
    expect(s.publish.mock.calls[2][0]).toHaveLength(1);
    expect(s.publish.mock.calls[2][1]).toHaveLength(0);
  });
  it("distinguishes operations and terminal failures", async () => {
    const s = setup();
    await s.poller.poll();
    s.transactions.mockResolvedValue({
      ok: true,
      history: [tx("tx:0"), tx("tx:1", "failed")],
    });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toHaveLength(2);
    expect(s.publish.mock.calls[1][1][1].message).toBe("Rejected");
  });
  it("drains log and transaction pages without skipping equal timestamps", async () => {
    const s = setup();
    await s.poller.poll();
    s.logs
      .mockResolvedValueOnce({
        ok: true,
        logs: [log("1")],
        nextCursor: "log-page",
        latestCursor: "1",
      })
      .mockResolvedValueOnce({
        ok: true,
        logs: [log("2")],
        nextCursor: null,
        latestCursor: "2",
      });
    s.transactions
      .mockResolvedValueOnce({
        ok: true,
        history: [tx("3")],
        nextCursor: "tx-page",
        latestCursor: "3",
      })
      .mockResolvedValueOnce({
        ok: true,
        history: [tx("4")],
        nextCursor: null,
        latestCursor: "4",
      });
    await s.poller.poll();
    expect(s.publish.mock.calls[1][1]).toHaveLength(4);
    expect(s.logs).toHaveBeenCalledWith("log-page", "newer");
    expect(s.transactions).toHaveBeenCalledWith("tx-page", "newer");
  });
  it("retains cursors and baseline when any request fails", async () => {
    const s = setup();
    s.logs.mockResolvedValueOnce({
      ok: true,
      logs: [],
      latestCursor: "baseline",
    });
    await s.poller.poll();
    s.logs.mockResolvedValue({
      ok: true,
      logs: [log("new")],
      latestCursor: "advanced",
    });
    s.transactions.mockResolvedValueOnce({ ok: false });
    await expect(s.poller.poll()).rejects.toThrow();
    expect(s.publish).toHaveBeenCalledTimes(1);
    await s.poller.poll();
    expect(s.logs).toHaveBeenLastCalledWith("baseline", "newer");
    expect(s.publish.mock.calls[1][1]).toHaveLength(1);
  });
  it("does not overlap polls", async () => {
    const s = setup();
    let release!: (value: unknown) => void;
    s.logs.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = s.poller.poll();
    await s.poller.poll();
    expect(s.logs).toHaveBeenCalledTimes(1);
    release({ ok: true, logs: [] });
    await pending;
  });
  it("discards stale account requests and starts new accounts with a fresh baseline", async () => {
    let active = true;
    const transport = {
      logs: vi.fn().mockImplementation(async () => {
        active = false;
        return { ok: true, logs: [log("old")] };
      }),
      transactions: vi.fn(),
    };
    const publish = vi.fn();
    await createPersonalHistoryPoller({
      wallet: "alice",
      transport,
      publish,
      isCurrent: () => active,
      observe: vi.fn(),
      state: refreshState(),
    }).poll();
    expect(publish).not.toHaveBeenCalled();
    expect(transport.transactions).not.toHaveBeenCalled();
    const s = setup();
    s.logs.mockResolvedValue({ ok: true, logs: [log("new-account-history")] });
    await s.poller.poll();
    expect(s.publish.mock.calls[0][1]).toEqual([]);
  });
});

describe("receipt observations independent of activity presentation", () => {
  it("publishes correlated receipts during initial hydration without a toast", async () => {
    const observe = vi.fn(),
      publish = vi.fn();
    const poller = createPersonalHistoryPoller({
      wallet: "alice",
      transport: {
        logs: async () => ({ ok: true, logs: [log("l", "t:0")] }),
        transactions: async () => ({ ok: true, history: [tx("t:0")] }),
      },
      publish,
      isCurrent: () => true,
      observe,
      state: refreshState(),
    });
    await poller.poll();
    expect(observe).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "l" })],
      [expect.objectContaining({ txHash: "t:0" })],
      [],
    );
    expect(publish.mock.calls[0][1]).toEqual([]);
  });
  it("drains initial pages while retaining the newest baseline cursor", async () => {
    const observe = vi.fn();
    const logs = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        logs: [log("new")],
        nextCursor: "older",
        latestCursor: "newest",
      })
      .mockResolvedValueOnce({
        ok: true,
        logs: [log("old")],
        latestCursor: "old",
      })
      .mockResolvedValue({ ok: true, logs: [] });
    const poller = createPersonalHistoryPoller({
      wallet: "alice",
      transport: {
        logs,
        transactions: async () => ({ ok: true, history: [] }),
      },
      publish: vi.fn(),
      isCurrent: () => true,
      observe,
      state: refreshState(),
    });
    await poller.poll();
    await poller.poll();
    expect(observe.mock.calls[0][0]).toHaveLength(2);
    expect(logs).toHaveBeenLastCalledWith("newest", "newer");
  });
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const settle = async () => {
  for (let index = 0; index < 10; index++) await Promise.resolve();
};

describe("authoritative history refresh coordination", () => {
  it("observes hydrated receipts before refreshing and marks ready only after both snapshots", async () => {
    const s = setup();
    const inventory = deferred<boolean>();
    s.logs.mockResolvedValue({ ok: true, logs: [log("entry", "tx:0")] });
    s.transactions.mockResolvedValue({ ok: true, history: [tx("tx:0")] });
    s.state.refreshInventory.mockReturnValueOnce(inventory.promise);
    await s.poller.poll();
    expect(s.observe).toHaveBeenCalledOnce();
    expect(s.observe.mock.invocationCallOrder[0]).toBeLessThan(
      s.state.refreshPlayer.mock.invocationCallOrder[0],
    );
    expect(s.publish.mock.calls[0][1]).toEqual([]);
    expect(s.state.onReady).not.toHaveBeenCalled();
    inventory.resolve(true);
    await settle();
    expect(s.state.onReady).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent refresh requests into one additional pass", async () => {
    const s = setup();
    const player = deferred<boolean>();
    s.state.refreshPlayer.mockReturnValueOnce(player.promise);
    const first = s.poller.refresh();
    await s.poller.refresh();
    await s.poller.refresh();
    expect(s.state.refreshPlayer).toHaveBeenCalledOnce();
    expect(s.state.refreshInventory).toHaveBeenCalledOnce();
    player.resolve(true);
    await first;
    expect(s.state.refreshPlayer).toHaveBeenCalledTimes(2);
    expect(s.state.refreshInventory).toHaveBeenCalledTimes(2);
    expect(s.state.onReady).toHaveBeenCalledOnce();
  });

  it.each(["false result", "exception"])(
    "leaves a failed refresh pending for the next poll after a %s",
    async (failure) => {
      const s = setup();
      if (failure === "exception")
        s.state.refreshPlayer.mockRejectedValueOnce(new Error("Unavailable"));
      else s.state.refreshPlayer.mockResolvedValueOnce(false);
      await s.poller.refresh();
      expect(s.state.onReady).not.toHaveBeenCalled();
      await s.poller.poll();
      await settle();
      expect(s.state.refreshPlayer).toHaveBeenCalledTimes(2);
      expect(s.state.refreshInventory).toHaveBeenCalledTimes(2);
      expect(s.state.onReady).toHaveBeenCalledOnce();
    },
  );

  it("refreshes duplicate observations even when presentation suppresses their toasts", async () => {
    const s = setup();
    s.logs.mockResolvedValue({ ok: true, logs: [log("entry", "tx:0")] });
    s.transactions.mockResolvedValue({ ok: true, history: [tx("tx:0")] });
    await s.poller.poll();
    await settle();
    await s.poller.poll();
    await settle();
    expect(s.observe).toHaveBeenCalledTimes(2);
    expect(s.publish.mock.calls[1][0]).toEqual([]);
    expect(s.publish.mock.calls[1][1]).toEqual([]);
    expect(s.state.onReady).toHaveBeenCalledTimes(2);
  });

  it("invalidates pending history and refresh callbacks when stopped", async () => {
    const s = setup();
    const logs = deferred<{ ok: boolean; logs: LogDto[] }>();
    const inventory = deferred<boolean>();
    s.logs.mockReturnValueOnce(logs.promise);
    s.state.refreshInventory.mockReturnValueOnce(inventory.promise);
    const polling = s.poller.poll();
    const refreshing = s.poller.refresh();
    s.poller.stop();
    logs.resolve({ ok: true, logs: [log("late")] });
    inventory.resolve(true);
    await Promise.all([polling, refreshing]);
    expect(s.transactions).not.toHaveBeenCalled();
    expect(s.observe).not.toHaveBeenCalled();
    expect(s.publish).not.toHaveBeenCalled();
    expect(s.state.onReady).not.toHaveBeenCalled();
    await s.poller.poll();
    await s.poller.refresh();
    expect(s.logs).toHaveBeenCalledOnce();
    expect(s.state.refreshPlayer).toHaveBeenCalledOnce();
  });

  it.each(["logout", "switch", "same-account reconnect"])(
    "discards readiness after %s",
    async (change) => {
      const session = { mode: "wallet", wallet: "alice", connectedAt: 1 };
      const s = setup(
        () =>
          session.mode === "wallet" &&
          session.wallet === "alice" &&
          session.connectedAt === 1,
      );
      const player = deferred<boolean>();
      s.state.refreshPlayer.mockReturnValueOnce(player.promise);
      const refreshing = s.poller.refresh();
      if (change === "logout") session.mode = "guest";
      if (change === "switch") session.wallet = "bob";
      session.connectedAt = 2;
      player.resolve(true);
      await refreshing;
      await s.poller.poll();
      expect(s.state.onReady).not.toHaveBeenCalled();
      expect(s.logs).not.toHaveBeenCalled();
    },
  );
});
