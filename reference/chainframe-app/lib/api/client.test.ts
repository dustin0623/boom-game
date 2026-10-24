import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  state: { mode: "wallet", address: "alice", connectedAt: 1 },
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ ...auth.state }) },
}));
import {
  getWalletBalance,
  getMarketSales,
  getActivityLogs,
  getPersonalMarketHistory,
  getShopPrices,
  fetchShopPrices,
  fetchGameStats,
  fetchLeaderboard,
  fetchReferrals,
  getMarketListings,
  getTreasuryBalance,
  purchaseConsumable,
  listMarketItem,
  cancelMarketListing,
  setAuthToken,
  loadAuthToken,
  getMe,
} from "./client";
const actions = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/features/events/frontend/broadcast-game-action/submit", () => ({
  submitSignedGameAction: actions.submit,
}));
const fetcher = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  auth.state = { mode: "wallet", address: "alice", connectedAt: 1 };
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  vi.stubGlobal("fetch", fetcher);
  setAuthToken("test-token");
});
describe("Histories reads", () => {
  it("sends the optional referrer on the profile request while ordinary reads stay unchanged", async () => {
    fetcher.mockResolvedValue(Response.json({ ok: true, player: { referredBy: "corven" } }));
    await getMe("corven");
    await getMe();
    await getMe("corven&other=value");
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/player/me?ref=corven", "/api/player/me", "/api/player/me?ref=corven%26other%3Dvalue",
    ]);
    expect((fetcher.mock.calls[0][1].headers as Headers).get("Authorization")).toBe("Bearer test-token");
  });
  it("guards referral requests before and after fetching and uses the authenticated no-store read", async () => {
    const isCurrent = vi.fn(() => false);
    await expect(fetchReferrals({ isCurrent })).rejects.toThrow("session changed");
    expect(fetcher).not.toHaveBeenCalled();
    isCurrent.mockReturnValue(true);
    fetcher.mockResolvedValue(Response.json({ ok: true, referralHiveEarned: 7.5, referralEarned: 0.05, referred: [] }));
    await expect(fetchReferrals({ isCurrent })).resolves.toMatchObject({ referralHiveEarned: 7.5, referralEarned: 0.05 });
    expect(fetcher).toHaveBeenCalledWith("/api/player/referrals", expect.objectContaining({ cache: "no-store", headers: expect.any(Headers) }));
    const headers = fetcher.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer test-token");
    fetcher.mockImplementation(async () => {
      isCurrent.mockReturnValue(false);
      return Response.json({ ok: true, referralHiveEarned: 999, referred: [] });
    });
    await expect(fetchReferrals({ isCurrent })).rejects.toThrow("session changed");
  });
  it("stores only the Chainframe bearer token and ignores an old token", () => {
    expect(localStorage.getItem("chainframe.token")).toBe("test-token");
    // Deliberately obsolete browser evidence must not restore authentication.
    localStorage.setItem("cryptocore.token", "old-token");
    setAuthToken(null);
    expect(loadAuthToken()).toBeNull();
    expect(localStorage.getItem("cryptocore.token")).toBe("old-token");
    setAuthToken("new-token");
    expect(localStorage.getItem("chainframe.token")).toBe("new-token");
  });
  it("keeps default polling requests intact and sends category/cursor and the marketplace limits with bearer authentication", async () => {
    fetcher.mockResolvedValue(
      Response.json({ ok: true, logs: [], nextCursor: null }),
    );
    await getActivityLogs();
    await getActivityLogs(
      50,
      '{"time":1,"id":"000000000000000000000001"}',
      "older",
      "raids",
    );
    await getPersonalMarketHistory(100);
    await getMarketSales(100);
    const paths = fetcher.mock.calls.map(([path]) => path);
    expect(paths[0]).toBe("/api/logs?limit=50&direction=older");
    expect(paths[1]).toContain("&category=raids");
    expect(
      new URL(String(paths[1]), "http://localhost").searchParams.get("cursor"),
    ).toBe('{"time":1,"id":"000000000000000000000001"}');
    expect(paths.slice(2)).toEqual([
      "/api/logs/market?limit=100",
      "/api/logs/market/sales?limit=100",
    ]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options.cache).toBe("no-store");
      expect(options.headers.get("Authorization")).toBe("Bearer test-token");
    }
  });
});
describe("guarded game statistics", () => {
  it("does not fetch for an obsolete session", async () => {
    await expect(fetchGameStats({ isCurrent: () => false })).rejects.toThrow(
      "Wallet session changed",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requests exact metric/range and discards a response after reconnect", async () => {
    let current = true;
    fetcher.mockImplementation(async () => {
      current = false;
      return Response.json({ ok: true, kind: "daily" });
    });
    await expect(
      fetchGameStats({ metric: "claimed", days: 7, isCurrent: () => current }),
    ).rejects.toThrow("Wallet session changed");
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/game/stats?metric=claimed&days=7",
    );
  });
  it("preserves API errors and rejects an unexpected response kind", async () => {
    fetcher.mockResolvedValueOnce(
      Response.json(
        { error: "Unable to read game statistics" },
        { status: 503 },
      ),
    );
    await expect(fetchGameStats({ isCurrent: () => true })).rejects.toThrow(
      "Unable to read game statistics",
    );
    fetcher.mockResolvedValueOnce(Response.json({ ok: true, kind: "daily" }));
    await expect(fetchGameStats({ isCurrent: () => true })).rejects.toThrow(
      "Unable to read game statistics",
    );
  });
});
describe("session-guarded shop price reads", () => {
  const prices = {
    globalMinerate: 1,
    asOf: 1,
    chests: { equipment: 110 },
    emission: {
      yesterday: 101_000,
      pricedAt: 101_000,
      threshold: 100_000,
      excess: 1_000,
    },
  };
  it("returns the captured session's authoritative snapshot", async () => {
    fetcher.mockResolvedValue(Response.json({ ok: true, ...prices }));
    const isCurrent = vi.fn(() => true);
    expect(await fetchShopPrices({ isCurrent })).toEqual(prices);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(isCurrent).toHaveBeenCalledTimes(2);
  });
  it("does not request prices for an obsolete session", async () => {
    await expect(fetchShopPrices({ isCurrent: () => false })).rejects.toThrow(
      "Wallet session changed",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("discards responses after switching or reconnecting", async () => {
    let current = true;
    let resolve!: (response: Response) => void;
    fetcher.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const pending = expect(
      fetchShopPrices({ isCurrent: () => current }),
    ).rejects.toThrow("Wallet session changed");
    current = false;
    resolve(Response.json({ ok: true, ...prices }));
    await pending;
  });
  it.each([
    [{ ok: false, error: "Server unavailable" }, "Server unavailable"],
    [{ ok: false }, "Prices unavailable"],
  ])("preserves unavailable/error responses", async (body, message) => {
    fetcher.mockResolvedValue(
      Response.json(body, {
        status: message === "Server unavailable" ? 503 : 200,
      }),
    );
    await expect(fetchShopPrices({ isCurrent: () => true })).rejects.toThrow(
      String(message),
    );
  });
});
describe("wallet balance and public sales", () => {
  it("forwards listing submission callbacks without resolving settlement early", async () => {
    const onSubmitted = vi.fn();
    let resolve!: (result: { ok: boolean }) => void;
    actions.submit.mockImplementation((_action, _metadata, callback) => {
      callback();
      return new Promise<{ ok: boolean }>((done) => {
        resolve = done;
      });
    });
    let finished = false;
    const result = listMarketItem("item-1", 25, onSubmitted).then((value) => {
      finished = true;
      return value;
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    expect(actions.submit).toHaveBeenCalledWith(
      "market_list",
      { itemId: "item-1", price: 25, currency: "HIVE" },
      onSubmitted,
    );
    resolve({ ok: true });
    expect(await result).toEqual({ ok: true });
  });
  it("forwards cancellation submission callbacks through the shared broadcaster", async () => {
    const onSubmitted = vi.fn();
    actions.submit.mockResolvedValue({ ok: true });
    expect(await cancelMarketListing("item-1", onSubmitted)).toEqual({
      ok: true,
    });
    expect(actions.submit).toHaveBeenCalledWith(
      "market_cancel",
      { itemId: "item-1" },
      onSubmitted,
    );
  });
  it("retains price response fields including emission", async () => {
    const prices = {
      globalMinerate: 5,
      playerMinerate: 1,
      chests: { equipment: 110 },
      chestHivePrice: 10,
      asOf: 1,
      emission: {
        yesterday: 100_000,
        pricedAt: 101_000,
        threshold: 100_000,
        excess: 1_000,
      },
      consumables: { "help-kit": { price: 1.1, hivePrice: 0.1, owned: 2 } },
    };
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ...prices })),
    );
    expect(await getShopPrices()).toEqual({ ok: true, prices });
  });
  it("passes the displayed whole-HASH price through the signed mismatch guard", async () => {
    actions.submit.mockResolvedValue({ ok: true });
    await purchaseConsumable("help-kit", 3, 2);
    expect(actions.submit).toHaveBeenCalledWith(
      "purchase_consumable",
      {
        itemId: "help-kit",
        quantity: 3,
        expectedUnitPrice: 2,
      },
      undefined,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("authenticates balance requests", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, balance: 5 })),
    );
    expect(await getWalletBalance()).toEqual({ ok: true, balance: 5 });
    expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe(
      "Bearer test-token",
    );
  });
  it("selects native HIVE without changing default HASH requests", async () => {
    fetcher.mockResolvedValue(
      Response.json({ ok: true, balance: 1.125, symbol: "HIVE", precision: 3 }),
    );
    expect(await getWalletBalance("HIVE")).toMatchObject({
      balance: 1.125,
      symbol: "HIVE",
      precision: 3,
    });
    expect(fetcher.mock.calls[0][0]).toBe("/api/wallet/balance?asset=HIVE");
    expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe(
      "Bearer test-token",
    );
  });
  it("preserves unavailable responses instead of zero", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }),
    );
    expect(await getWalletBalance()).toEqual({
      ok: false,
      error: "Unavailable",
    });
  });
  it.each(["switch", "reconnect", "logout"])(
    "discards balances after %s",
    async (change) => {
      let resolve!: (v: Response) => void;
      fetcher.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const pending = getWalletBalance();
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
      auth.state = {
        mode: change === "logout" ? "" : "wallet",
        address: change === "switch" ? "bob" : "alice",
        connectedAt: 2,
      };
      resolve(new Response(JSON.stringify({ ok: true, balance: 999 })));
      expect(await pending).toEqual({
        ok: false,
        error: "Wallet session changed",
      });
    },
  );
  it("requests marketplace sales with bearer credentials and no-store", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, logs: [] })),
    );
    expect(await getMarketSales()).toEqual({ ok: true, logs: [] });
    expect(fetcher.mock.lastCall?.[0]).toBe("/api/logs/market/sales?limit=25");
    expect(fetcher.mock.lastCall?.[1].headers.get("authorization")).toBe(
      "Bearer test-token",
    );
    expect(fetcher.mock.lastCall?.[1].cache).toBe("no-store");
  });
});

describe("guarded leaderboard and authenticated market reads", () => {
  it("rejects obsolete leaderboard sessions before and after requests", async () => {
    await expect(
      fetchLeaderboard({
        page: 1,
        isCurrent: () => false,
      }),
    ).rejects.toThrow("session changed");
    expect(fetcher).not.toHaveBeenCalled();
    let current = true;
    fetcher.mockImplementationOnce(async () => {
      current = false;
      return Response.json({ ok: true, page: 2 });
    });
    await expect(
      fetchLeaderboard({ page: 2, isCurrent: () => current }),
    ).rejects.toThrow("session changed");
  });
  it("fetches the exact ranking and preserves authenticated API errors", async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        ok: true,
        weights: { notoriety: 30, mining: 30, progression: 40 },
        page: 4,
      }),
    );
    await expect(
      fetchLeaderboard({
        page: 4,
        isCurrent: () => true,
      }),
    ).resolves.toMatchObject({ page: 4 });
    expect(fetcher.mock.lastCall?.[0]).toBe("/api/game/leaderboard?page=4");
    fetcher.mockResolvedValueOnce(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    await expect(
      fetchLeaderboard({ page: 1, isCurrent: () => true }),
    ).rejects.toThrow("Unauthorized");
  });
  it("rejects a response without the current combined-score contract", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ok: true, page: 1 }));
    await expect(
      fetchLeaderboard({ page: 1, isCurrent: () => true }),
    ).rejects.toThrow("Unable to read leaderboard");
  });
  it.each([
    ["listings", getMarketListings, "/api/market"],
    ["treasury", getTreasuryBalance, "/api/wallet/treasury-balance"],
  ] as const)("authenticates %s reads", async (_name, execute, path) => {
    fetcher.mockResolvedValueOnce(
      Response.json({ ok: true, listings: [], balance: 1 }),
    );
    await execute();
    expect(fetcher.mock.lastCall?.[0]).toBe(path);
    expect(fetcher.mock.lastCall?.[1].headers.get("authorization")).toBe(
      "Bearer test-token",
    );
    expect(fetcher.mock.lastCall?.[1].cache).toBe("no-store");
  });
});
