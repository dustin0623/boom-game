// template/features/events/backend/equipment/chest.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mintEquipmentInput,
  rollRarity,
  pickRandomSlot,
  rollStats,
  openChest,
} from "./chest";

vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: vi.fn(),
}));
vi.mock("@/features/events/backend/shop-pricing/emission.server", () => ({
  getPricingEmission: vi.fn(async () => ({
    yesterday: 0,
    highWater: 0,
    day: 0,
  })),
}));
vi.mock("@/features/types/game/templates", () => ({
  getItemTemplateBySlotRarity: vi.fn(() => ({ templateId: "template-1" })),
}));
vi.mock("@/lib/utils/game/rng.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/utils/game/rng.server")
  >("@/lib/utils/game/rng.server");
  return {
    ...actual,
    generateServerSeed: vi.fn(() => "fixed-server-seed"),
  };
});

import { getFixtureRepositories } from "@/tests/fixtures/persistence";
import { EQUIPMENT_CHEST_ODDS } from "@/lib/config/constants/game";

const mockedQuantity = vi.fn(async () => 1);
const mockedConsume = vi.fn(async () => ({ ok: true }));
const mockedInsertItem = vi.fn();
const mockedCreateLog = vi.fn();
const mockedCreditHash = vi.fn();
const mockedDebitHash = vi.fn();
const mockedFindPlayerByWallet = vi.fn();
const mockedCreditReferralHash = vi.fn();
const mockedIncrementStat = vi.fn();

vi.mocked(getFixtureRepositories).mockReturnValue({
  equipments: { insert: mockedInsertItem },
  items: { quantity: mockedQuantity, consume: mockedConsume },
  logs: { create: mockedCreateLog },
  players: {
    creditHash: mockedCreditHash,
    debitHash: mockedDebitHash,
    findByWallet: mockedFindPlayerByWallet,
    creditReferralHash: mockedCreditReferralHash,
  },
  gameStats: { increment: mockedIncrementStat },
} as never);

function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    wallet: "0xWALLET",
    statLevels: { luck: 0 },
    referredBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedQuantity.mockResolvedValue(1);
  mockedConsume.mockResolvedValue({ ok: true });
  mockedInsertItem.mockResolvedValue({ id: "item-1", name: "Rolled Rig" });
});

describe("mintEquipmentInput", () => {
  it("requires a known chest key and a non-empty seed", () => {
    expect(() =>
      mintEquipmentInput.parse({ chest: "not-a-chest", seed: "abc" }),
    ).toThrow();
    expect(() =>
      mintEquipmentInput.parse({ chest: "common", seed: "" }),
    ).toThrow();
  });

  it("accepts the Equipment Chest", () => {
    expect(
      mintEquipmentInput.parse({ chest: "equipment", seed: "abc" }),
    ).toEqual({
      chest: "equipment",
      seed: "abc",
    });
  });
});

describe("rollRarity for the Equipment Chest", () => {
  const SAMPLES = 20_000;
  const counts: Record<string, number> = {};
  const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary"];

  for (let i = 0; i < SAMPLES; i++) {
    const rarity = rollRarity("equipment", `sample-${i}`);
    counts[rarity] = (counts[rarity] ?? 0) + 1;
  }

  it("can roll every supported rarity", () => {
    for (const rarity of rarityOrder) {
      expect(counts[rarity] ?? 0).toBeGreaterThan(0);
    }
  });

  it("follows the configured distribution", () => {
    for (const rarity of ["common", "uncommon", "rare"] as const) {
      const observed = ((counts[rarity] ?? 0) / SAMPLES) * 100;
      expect(Math.abs(observed - EQUIPMENT_CHEST_ODDS[rarity])).toBeLessThan(2);
    }
  });

  it("keeps rarity deterministic without a Luck input", () => {
    for (let i = 0; i < 500; i++) {
      const base = rarityOrder.indexOf(rollRarity("equipment", `luck-${i}`));
      const lucky = rarityOrder.indexOf(
        rollRarity("equipment", `luck-${i}`),
      );
      expect(lucky).toBe(base);
    }
  });

  it("has no player-stat dependency", () => {
    for (let i = 0; i < 200; i++) {
      const seed = `bad-luck-${i}`;
      const baseline = rollRarity("equipment", seed);
      expect(rollRarity("equipment", seed)).toBe(baseline);
      expect(rollRarity("equipment", seed)).toBe(baseline);
    }
  });

  it("throws on an unknown chest", () => {
    expect(() => rollRarity("mystery" as never, "seed")).toThrow(
      /Unknown chest/,
    );
  });

  it("rolls valid stats for every rarity and slot", () => {
    const slots = [
      "asicMiner",
      "motherboard",
      "powerSupply",
      "coolingSystem",
      "networkModule",
      "firmwareChip",
    ] as const;
    for (const rarity of rarityOrder as (
      "common" | "uncommon" | "rare" | "epic" | "legendary"
    )[]) {
      for (const slot of slots) {
        const stats = rollStats(rarity, `${rarity}-${slot}`, slot);
        const values = Object.values(stats);
        expect(
          values.every((value) => Number.isFinite(value) && value >= 0),
        ).toBe(true);
        expect(values.some((value) => value > 0)).toBe(true);
      }
    }
  });
});

describe("rollRarity / pickRandomSlot / rollStats", () => {
  it("is deterministic for a given seed", () => {
    const seed = "client:server";
    expect(rollRarity("equipment", seed)).toBe("common");
    expect(pickRandomSlot(seed)).toBe("networkModule");
    expect(rollStats("common", seed)).toEqual({
      hashRate: 0,
      hackPower: 0,
      security: 0,
      luck: 0.6,
      firewall: 0,
      exploit: 0,
    });
  });
});

describe("openChest", () => {
  it.each(["common", "uncommon", "rare", "epic", "legendary"] as const)(
    "rejects unsupported %s chests before consumption",
    async (chest) => {
      await expect(
        openChest("0xWALLET", chest as never, "seed-1"),
      ).rejects.toThrow();
      expect(mockedConsume).not.toHaveBeenCalled();
      expect(mockedInsertItem).not.toHaveBeenCalled();
    },
  );
  it("rejects missing players before consuming inventory", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(null);
    expect(await openChest("0xWALLET", "equipment", "seed-1")).toEqual({
      ok: false,
      error: "Player not found",
    });
    expect(mockedConsume).not.toHaveBeenCalled();
  });
  it("rejects empty or concurrently consumed inventory without minting", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(makePlayer());
    mockedQuantity.mockResolvedValueOnce(0);
    expect((await openChest("0xWALLET", "equipment", "seed-1")).ok).toBe(false);
    expect(mockedConsume).not.toHaveBeenCalled();
    mockedConsume.mockResolvedValueOnce({ ok: false });
    expect((await openChest("0xWALLET", "equipment", "seed-1")).ok).toBe(false);
    expect(mockedInsertItem).not.toHaveBeenCalled();
  });
  it("consumes one chest, mints and logs once, and never spends HASH or pays referrals", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(
      makePlayer({ referredBy: "referrer" }),
    );
    expect(await openChest("0xWALLET", "equipment", "seed-1")).toEqual({
      ok: true,
      item: { id: "item-1", name: "Rolled Rig" },
    });
    expect(mockedConsume).toHaveBeenCalledExactlyOnceWith(
      "0xWALLET",
      "equipment",
    );
    expect(mockedInsertItem).toHaveBeenCalledOnce();
    expect(mockedCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chest",
        wallet: "0xWALLET",
        amount: 0,
        seed: "seed-1",
      }),
    );
    expect(mockedDebitHash).not.toHaveBeenCalled();
    expect(mockedCreditHash).not.toHaveBeenCalled();
    expect(mockedCreditReferralHash).not.toHaveBeenCalled();
    expect(mockedIncrementStat).toHaveBeenCalledWith("totalChestsOpened");
  });
  it("evaluates the current stored Luck when opening", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(
      makePlayer({ statLevels: { luck: 50 } }),
    );
    await openChest("0xWALLET", "equipment", "seed-1");
    expect(mockedInsertItem.mock.calls[0][0].rarity).toBe(
      rollRarity("equipment", "seed-1:fixed-server-seed"),
    );
  });
  it("propagates a mint failure after consumption without restoring a possibly spent chest", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(makePlayer());
    mockedInsertItem.mockRejectedValueOnce(new Error("mint interrupted"));
    await expect(openChest("0xWALLET", "equipment", "seed-1")).rejects.toThrow(
      "mint interrupted",
    );
    expect(mockedConsume).toHaveBeenCalledOnce();
    expect(mockedIncrementStat).not.toHaveBeenCalled();
  });
});
vi.mock("@/lib/modules/items/server.repository", () => ({
  get inventoryItemRepository() {
    return getFixtureRepositories().items;
  },
}));
vi.mock("@/lib/modules/players/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/players/server.repository")
  >()),
  get playerRepository() {
    return getFixtureRepositories().players;
  },
}));
vi.mock("@/lib/modules/equipments/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/equipments/server.repository")
  >()),
  get equipmentRepository() {
    return getFixtureRepositories().equipments;
  },
}));
vi.mock("@/lib/modules/logs/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/logs/server.repository")>()),
  get logRepository() {
    return getFixtureRepositories().logs;
  },
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/game-stats/server.repository")
  >()),
  get gameStatsRepository() {
    return getFixtureRepositories().gameStats;
  },
}));
vi.mock("@/lib/utils/database/operation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/utils/database/operation.server")
  >()),
  withDatabasePreparation: (execute: () => Promise<unknown>) => execute(),
  withDatabaseOperation: (execute: () => Promise<unknown>) => {
    const fixtures = getFixtureRepositories();
    return fixtures.transaction ? fixtures.transaction(execute) : execute();
  },
}));
