import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  find: vi.fn(),
  list: vi.fn(),
  cancel: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/lib/modules/equipments/server.repository", () => ({
  equipmentRepository: {
    findById: calls.find,
    listForSale: calls.list,
    cancelListing: calls.cancel,
  },
}));
vi.mock("@/lib/modules/logs/server.repository", () => ({
  logRepository: { create: calls.log },
}));
import { changeMarketListing } from "./action";
beforeEach(() => {
  vi.resetAllMocks();
  calls.find.mockResolvedValue({
    name: "Miner",
    market: { price: 5, currency: "HIVE" },
  });
  calls.list.mockResolvedValue({ ok: true });
  calls.cancel.mockResolvedValue({ ok: true });
});
describe("manual HIVE listings", () => {
  it.each([0.001, 0.101, 1])(
    "lists exact price %s and records its currency",
    async (price) => {
      expect(
        await changeMarketListing("seller", "item", price, "HIVE"),
      ).toEqual({ ok: true });
      expect(calls.list).toHaveBeenCalledExactlyOnceWith(
        "item",
        "seller",
        price,
      );
      expect(calls.log).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price, currency: "HIVE" }),
        }),
      );
    },
  );
  it.each([0, -1, 0.0001, 1.0001, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects invalid price %s before repository access",
    async (price) => {
      expect(
        (await changeMarketListing("seller", "item", price, "HIVE")).ok,
      ).toBe(false);
      expect(calls.list).not.toHaveBeenCalled();
      expect(calls.find).not.toHaveBeenCalled();
    },
  );
  it("rejects old signed listings without explicit HIVE", async () => {
    expect((await changeMarketListing("seller", "item", 5)).ok).toBe(false);
    expect(calls.list).not.toHaveBeenCalled();
  });
  it("allows HIVE cancellation with explicit HIVE history", async () => {
    expect(await changeMarketListing("seller", "item")).toEqual({ ok: true });
    expect(calls.cancel).toHaveBeenCalledWith("item", "seller");
    expect(calls.log).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cancelled",
          currency: "HIVE",
        }),
      }),
    );
  });
});
