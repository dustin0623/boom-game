import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  player: vi.fn(),
  emission: vi.fn(),
}));
vi.mock("./emission.server", () => ({ getPricingEmission: state.emission }));
import { toShopPricesDto } from "@/lib/api/dto/shop-prices";
import {
  getLiveConsumablePrice,
  getLiveEquipmentChestPrice,
} from "./prices.server";

beforeEach(() => {
  vi.clearAllMocks();
  state.emission.mockResolvedValue({
    yesterday: 50_000,
    highWater: 101_000,
    day: 1,
  });
  state.player.mockImplementation(async (wallet: string) => ({
    stats: { hashRate: wallet === "alice" ? 1 : 10_000 },
  }));
});
describe("shared shop quotes with personal inventory", () => {
  it("gives different wallets identical prices but their own counts and informational minerate", async () => {
    const alice = toShopPricesDto(
        10_000,
        await state.emission(),
        await state.player("alice"),
        1,
        { "help-kit": 2 },
      ),
      bob = toShopPricesDto(
        10_000,
        await state.emission(),
        await state.player("bob"),
        1,
        { "help-kit": 7 },
      );
    expect(alice.playerMinerate).toBe(1);
    expect(bob.playerMinerate).toBe(10_000);
    expect(alice.chests).toEqual(bob.chests);
    expect(alice.chests.equipment).toBe(110);
    expect(alice.consumables?.["help-kit"]).toEqual({
      price: 1,
      hivePrice: 0.1,
      owned: 2,
    });
    expect(bob.consumables?.["help-kit"]).toEqual({
      price: 1,
      hivePrice: 0.1,
      owned: 7,
    });
    expect(alice.emission).toEqual({
      yesterday: 50_000,
      pricedAt: 101_000,
      threshold: 100_000,
      excess: 1_000,
    });
  });
  it("uses the same completed-day price for quotes and purchase execution", async () => {
    const prices = toShopPricesDto(
      10_000,
      await state.emission(),
      await state.player("alice"),
      1,
    );
    expect(await getLiveEquipmentChestPrice()).toBe(prices.chests.equipment);
    for (const id of ["help-kit", "sabotage-device"] as const) {
      expect(await getLiveConsumablePrice(id)).toEqual({
        unitPrice: prices.consumables?.[id].price,
        pricedEmission: 101_000,
      });
    }
  });
});
