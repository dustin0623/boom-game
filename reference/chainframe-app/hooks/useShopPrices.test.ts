import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
  },
  swr: vi.fn(),
  prices: vi.fn(),
}));
vi.mock("swr", () => ({ default: mocks.swr }));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (fn: (s: typeof mocks.state) => unknown) => fn(mocks.state),
    { getState: () => ({ ...mocks.state }) },
  ),
}));
import { useShopPrices } from "./useShopPrices";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
  };
  mocks.swr.mockReturnValue({
    data: undefined,
    error: undefined,
    mutate: vi.fn(),
  });
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("fetch", mocks.prices);
  mocks.prices.mockResolvedValue(
    Response.json({ ok: true, playerMinerate: 1 }),
  );
});
describe("price cache isolation", () => {
  it("exposes the existing emission tier and wallet-owned counts", () => {
    const emission = {
      yesterday: 50_000,
      pricedAt: 101_000,
      threshold: 100_000,
      excess: 1_000,
    };
    mocks.swr.mockReturnValue({
      data: {
        emission,
        chests: { equipment: 110 },
        consumables: { "help-kit": { price: 1.1, hivePrice: 0.1, owned: 2 } },
      },
      error: undefined,
      mutate: vi.fn(),
    });
    const prices = useShopPrices();
    expect(prices.emission).toEqual(emission);
    expect(prices.consumablePrice("help-kit")).toBe(1.1);
    expect(prices.consumableOwned("help-kit")).toBe(2);
  });
  it("keys wallet and connection identity", () => {
    useShopPrices();
    expect(mocks.swr.mock.calls[0][0]).toEqual(["shop-prices", "alice", 1]);
    mocks.state.address = "bob";
    useShopPrices();
    expect(mocks.swr.mock.calls[1][0]).toEqual(["shop-prices", "bob", 1]);
    mocks.state.connectedAt = 2;
    useShopPrices();
    expect(mocks.swr.mock.calls[2][0]).toEqual(["shop-prices", "bob", 2]);
    expect(mocks.swr.mock.calls[0][2]).toMatchObject({
      keepPreviousData: false,
    });
  });
  it.each(["", "guest"])("disables authenticated fetching for %s", (mode) => {
    mocks.state.mode = mode;
    useShopPrices();
    expect(mocks.swr.mock.calls[0][0]).toBeNull();
    expect(mocks.prices).not.toHaveBeenCalled();
  });
  it("disables authenticated fetching before the API session is ready", () => {
    mocks.state.apiConnected = false;
    useShopPrices();
    expect(mocks.swr.mock.calls[0][0]).toBeNull();
    expect(mocks.prices).not.toHaveBeenCalled();
  });
  it.each(["account change", "same-account reconnect"])(
    "rejects an in-flight response after %s",
    async (change) => {
      useShopPrices();
      const [key, fetcher] = mocks.swr.mock.calls[0];
      let resolve!: (v: unknown) => void;
      mocks.prices.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const pending = expect(fetcher(key)).rejects.toThrow(
        "Wallet session changed",
      );
      if (change === "account change") mocks.state.address = "bob";
      else mocks.state.connectedAt = 2;
      resolve(Response.json({ ok: true, playerMinerate: 999 }));
      await pending;
    },
  );
});
