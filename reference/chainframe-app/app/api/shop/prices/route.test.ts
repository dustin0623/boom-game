import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/modules/items/server.repository", () => ({
  findInventoryItemsByWallet: vi.fn(async () => []),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/modules/players/server.repository", () => ({
  findPlayerByWallet: vi.fn(),
}));
vi.mock("@/lib/modules/game-stats/server.repository", () => ({
  gameStatsRepository: { get: vi.fn() },
}));
vi.mock("@/features/events/backend/shop-pricing/emission.server", () => ({
  getPricingEmission: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { findPlayerByWallet } from "@/lib/modules/players/server.repository";
import { findInventoryItemsByWallet } from "@/lib/modules/items/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import { getPricingEmission } from "@/features/events/backend/shop-pricing/emission.server";
import {
  getLiveConsumablePrice,
  getLiveEquipmentChestPrice,
} from "@/features/events/backend/shop-pricing/prices.server";
import {
  GLOBAL_MINERATE_KEY,
  SOCIAL_ECONOMY,
} from "@/lib/config/constants/economy";
import { GET } from "./route";

const request = () => new Request("http://localhost/api/shop/prices");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    wallet: "alice",
    username: "alice",
  });
  vi.mocked(gameStatsRepository.get).mockResolvedValue(12_345);
  vi.mocked(findPlayerByWallet).mockResolvedValue(null);
  vi.mocked(findInventoryItemsByWallet).mockResolvedValue([]);
  vi.mocked(getPricingEmission).mockResolvedValue({
    yesterday: 50_000,
    highWater: 101_000,
    day: 1,
  });
});

describe("GET /api/shop/prices", () => {
  it("requires authentication before accessing persistence or pricing", async () => {
    const unauthorized = Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
    vi.mocked(requireSession).mockResolvedValue(unauthorized);
    expect(await GET(request())).toBe(unauthorized);
    expect(gameStatsRepository.get).not.toHaveBeenCalled();
    expect(getPricingEmission).not.toHaveBeenCalled();
    expect(findPlayerByWallet).not.toHaveBeenCalled();
  });

  it("preserves the price envelope without a player record", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      globalMinerate: 12_345,
      chests: { equipment: 110 },
      chestHivePrice: 10,
      chestOwned: { equipment: 0 },
      emission: {
        yesterday: 50_000,
        pricedAt: 101_000,
        threshold: 100_000,
        excess: 1_000,
      },
      asOf: expect.any(Number),
    });
    expect(gameStatsRepository.get).toHaveBeenCalledWith(GLOBAL_MINERATE_KEY);
    expect(findPlayerByWallet).toHaveBeenCalledWith("alice");
  });

  it("preserves the informational minerate floor without writing it", async () => {
    vi.mocked(gameStatsRepository.get).mockResolvedValue(null);
    expect((await (await GET(request())).json()).globalMinerate).toBe(
      SOCIAL_ECONOMY.pricing.globalMinerateFloor,
    );
    expect(gameStatsRepository.get).toHaveBeenCalledOnce();
  });

  it("keeps owned counts personal and agrees with authoritative purchase quotes", async () => {
    vi.mocked(findPlayerByWallet).mockImplementation(
      async (wallet) =>
        ({
          wallet, vaultStaked: 0, notoriety: 0,
          statLevels: { hashRate: wallet === "alice" ? 500 : 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
          stats: { hashRate: wallet === "alice" ? 500 : 1 },
          loginNonce: "private",
          withdrawalReservations: [{ key: "private" }],
        }) as never,
    );
    vi.mocked(findInventoryItemsByWallet).mockImplementation(async (wallet) => [
      {
        wallet,
        itemId: "sabotage-device",
        quantity: wallet === "alice" ? 2 : 7,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const alice = await (await GET(request())).json();
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "bob",
      username: "bob",
    });
    const bob = await (await GET(request())).json();
    expect(alice.playerMinerate).toBe(500);
    expect(bob.playerMinerate).toBe(1);
    expect(alice.chests).toEqual(bob.chests);
    expect(alice.consumables["sabotage-device"]).toEqual({
      price: 1,
      hivePrice: 0.1,
      owned: 2,
    });
    expect(bob.consumables["sabotage-device"].owned).toBe(7);
    expect(await getLiveEquipmentChestPrice()).toBe(alice.chests.equipment);
    for (const id of ["help-kit", "sabotage-device"] as const)
      expect((await getLiveConsumablePrice(id)).unitPrice).toBe(
        alice.consumables[id].price,
      );
    expect(JSON.stringify(alice)).not.toContain("private");
  });

  it.each(["statistics", "emission", "player", "inventory"])(
    "retains unavailable responses after a %s failure",
    async (source) => {
      const failure = new Error("internal credentials");
      if (source === "inventory")
        vi.mocked(findInventoryItemsByWallet).mockRejectedValue(failure);
      if (source === "statistics")
        vi.mocked(gameStatsRepository.get).mockRejectedValue(failure);
      if (source === "emission")
        vi.mocked(getPricingEmission).mockRejectedValue(failure);
      if (source === "player")
        vi.mocked(findPlayerByWallet).mockRejectedValue(failure);
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Unable to read shop prices",
      });
    },
  );
});
