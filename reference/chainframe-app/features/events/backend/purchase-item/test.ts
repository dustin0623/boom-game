import { fixtureItemQuantities } from "@/tests/fixtures/persistence/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/tests/fixtures/persistence", async () => {
  const { createFixtureRepositories } =
    await import("@/tests/fixtures/persistence");
  const db = createFixtureRepositories();
  return { getFixtureRepositories: () => db };
});
vi.mock("@/features/events/backend/shop-pricing/emission.server", () => ({
  getPricingEmission: vi.fn(),
}));

import { getFixtureRepositories } from "@/tests/fixtures/persistence";
import {
  resetFixtureDatabase,
  getFixtureState,
  seedFixturePlayer,
} from "@/tests/fixtures/persistence/store";

import { getPricingEmission } from "@/features/events/backend/shop-pricing/emission.server";
import { getEmissionShopPrice } from "@/lib/utils/game/pricing";
import {
  CONSUMABLES,
  MAX_PURCHASE_QUANTITY,
} from "@/features/types/game/consumables";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import {
  purchaseConsumable,
  purchaseConsumableInput,
  purchaseChest,
  purchaseChestInput,
  grantPurchasedItems,
} from "./action";

const WALLET = "0xBUYER";

describe("owned chest purchases", () => {
  it.each(["sabotage-device", "help-kit"] as const)("rewards HASH purchases of %s", async (itemId) => {
    seedBuyer({ hash: 10 });
    player().referredBy = "referrer";
    seedFixturePlayer({ wallet: "referrer" });
    expect(await purchaseConsumable(WALLET, itemId, 2, 1)).toMatchObject({ ok: true, totalPrice: 2 });
    expect(player().hash).toBe(8);
    expect(getFixtureState().players.get("referrer")).toMatchObject({ hash: 0.1, referralEarned: 0.1 });
    expect(getFixtureState().logs.find((log) => log.type === "referral")).toMatchObject({
      amount: 0.1, data: { currency: "HASH", source: "shop", purchaseBasis: 2, itemId, quantity: 2 },
    });
  });
  it.each([null, WALLET, "missing"])("does not reward invalid referral %s or create its profile", async (referredBy) => {
    seedBuyer({ hash: 10 });
    player().referredBy = referredBy;
    expect((await purchaseConsumable(WALLET, "help-kit", 1)).ok).toBe(true);
    expect(player().hash).toBe(9);
    expect(getFixtureState().players.size).toBe(1);
    expect(getFixtureState().logs.filter((log) => log.type === "referral")).toHaveLength(0);
  });
  it("charges the emission-tier bulk price and rewards the actual HASH total", async () => {
    seedBuyer({ hash: 1000 });
    player().referredBy = "referrer";
    seedFixturePlayer({ wallet: "referrer" });
    vi.mocked(getPricingEmission).mockResolvedValue({
      yesterday: 101000,
      highWater: 101000,
      day: 1,
    });
    expect(await purchaseChest(WALLET, "equipment", 3, 110)).toMatchObject({
      ok: true,
      unitPrice: 110,
      totalPrice: 330,
      quantity: 3,
    });
    expect(player().hash).toBe(670);
    expect(fixtureItemQuantities(WALLET).equipment).toBe(3);
    expect(getFixtureState().players.get("referrer")?.hash).toBe(16.5);
    expect(getFixtureState().players.get("referrer")?.referralEarned).toBe(16.5);
    expect(getFixtureState().equipments.size).toBe(0);
    expect(
      getFixtureState().logs.filter((row) => row.type === "referral"),
    ).toHaveLength(1);
    expect(getFixtureState().logs[0]).toMatchObject({
      type: "shop",
      amount: -330,
      data: { itemId: "equipment", quantity: 3 },
    });
  });
  it("rejects stale quotes and insufficient balances before granting", async () => {
    seedBuyer({ hash: 99 });
    expect(await purchaseChest(WALLET, "equipment", 1, 999)).toMatchObject({
      code: "price_changed",
    });
    expect(await purchaseChest(WALLET, "equipment", 1, 100)).toMatchObject({
      ok: false,
      error: "Not enough HASH",
    });
    expect(player().hash).toBe(99);
    expect(fixtureItemQuantities(WALLET)).toEqual({});
  });
  it("defaults to one chest and rejects invalid quantities", () => {
    expect(purchaseChestInput.parse({ itemId: "equipment" }).quantity).toBe(1);
    for (const quantity of [0, 0.5, 26, NaN, Infinity])
      expect(
        purchaseChestInput.safeParse({ itemId: "equipment", quantity }).success,
      ).toBe(false);
  });
  it("credits HIVE purchases as stacks without creating HASH rewards", async () => {
    seedBuyer();
    player().referredBy = "referrer";
    seedFixturePlayer({ wallet: "referrer" });
    await grantPurchasedItems(WALLET, "equipment", 2, {
      paidWith: "hive",
      amountCharged: 20,
      unitPrice: 10,
      txHash: "payment",
    });
    expect(player().hash).toBe(100000);
    expect(fixtureItemQuantities(WALLET).equipment).toBe(2);
    expect(getFixtureState().players.get("referrer")?.hash).toBe(0);
    expect(getFixtureState().logs.filter((log) => log.type === "referral")).toHaveLength(0);
    expect(getFixtureState().logs[0]).toMatchObject({
      type: "shop",
      amount: 0,
      txHash: "payment",
      data: { hiveAmount: 20, quantity: 2 },
    });
    expect(getFixtureState().equipments.size).toBe(0);
  });
});

const basePrice = (id: keyof typeof CONSUMABLES) => CONSUMABLES[id].basePrice;
const player = () => getFixtureState().players.get(WALLET)!;

function seedBuyer(overrides: { hash?: number; hashRate?: number } = {}) {
  const seeded = seedFixturePlayer({
    wallet: WALLET,
    hash: overrides.hash ?? 100_000,
  });
  seeded.stats.hashRate = overrides.hashRate ?? 100;
}

beforeEach(() => {
  resetFixtureDatabase();
  vi.clearAllMocks();
  vi.mocked(getPricingEmission).mockResolvedValue({
    yesterday: 0,
    highWater: 0,
    day: 0,
  });
});

describe("purchaseConsumableInput", () => {
  it("accepts a known id and an integer quantity within bounds", () => {
    expect(
      purchaseConsumableInput.parse({ itemId: "help-kit", quantity: 3 }),
    ).toEqual({
      itemId: "help-kit",
      quantity: 3,
    });
  });

  it("rejects unknown ids and out-of-range or non-integer quantities", () => {
    expect(() =>
      purchaseConsumableInput.parse({ itemId: "nope", quantity: 1 }),
    ).toThrow();
    expect(() =>
      purchaseConsumableInput.parse({ itemId: "help-kit", quantity: 0 }),
    ).toThrow();
    expect(() =>
      purchaseConsumableInput.parse({ itemId: "help-kit", quantity: -2 }),
    ).toThrow();
    expect(() =>
      purchaseConsumableInput.parse({ itemId: "help-kit", quantity: 1.5 }),
    ).toThrow();
    expect(() =>
      purchaseConsumableInput.parse({
        itemId: "help-kit",
        quantity: MAX_PURCHASE_QUANTITY + 1,
      }),
    ).toThrow();
  });

  it("strips a client-supplied price and any target", () => {
    const parsed = purchaseConsumableInput.parse({
      itemId: "sabotage-device",
      quantity: 1,
      price: 1,
      target: "0xVICTIM",
    });
    expect(parsed).toEqual({ itemId: "sabotage-device", quantity: 1 });
  });
});

describe("purchaseConsumable concurrency (anti-abuse)", () => {
  it("charges once when the same item is purchased twice at the same time", async () => {
    seedBuyer({ hash: 100_000, hashRate: 100 });
    const unit = getEmissionShopPrice({
      basePrice: basePrice("help-kit"),
      emission: 0,
    });

    const results = await Promise.all([
      purchaseConsumable(WALLET, "help-kit", 1),
      purchaseConsumable(WALLET, "help-kit", 1),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const rejected = results.find((r) => !r.ok);
    expect(rejected).toMatchObject({ ok: false, code: "duplicate_request" });
    expect(player().hash).toBe(100_000 - unit);
    expect(fixtureItemQuantities(WALLET)["help-kit"]).toBe(1);
  });

  it("lets different items be purchased at the same time", async () => {
    seedBuyer({ hash: 1_000_000, hashRate: 100 });

    const results = await Promise.all([
      purchaseConsumable(WALLET, "help-kit", 1),
      purchaseConsumable(WALLET, "sabotage-device", 1),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(fixtureItemQuantities(WALLET)["help-kit"]).toBe(1);
    expect(fixtureItemQuantities(WALLET)["sabotage-device"]).toBe(1);
  });

  it("releases the lock after a purchase so a later one succeeds", async () => {
    seedBuyer({ hash: 1_000_000, hashRate: 100 });

    const first = await purchaseConsumable(WALLET, "help-kit", 1);
    const second = await purchaseConsumable(WALLET, "help-kit", 1);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fixtureItemQuantities(WALLET)["help-kit"]).toBe(2);
  });

  it("releases the lock when the purchase throws", async () => {
    seedBuyer({ hash: 1_000_000, hashRate: 100 });
    vi.mocked(getPricingEmission).mockRejectedValueOnce(new Error("boom"));

    await expect(purchaseConsumable(WALLET, "help-kit", 1)).rejects.toThrow(
      "boom",
    );
    const retry = await purchaseConsumable(WALLET, "help-kit", 1);

    expect(retry.ok).toBe(true);
  });
});

describe("purchaseConsumable", () => {
  it("adds to inventory and deducts the computed price", async () => {
    seedBuyer({ hash: 100_000, hashRate: 100 });
    const unit = getEmissionShopPrice({
      basePrice: basePrice("sabotage-device"),
      emission: 0,
    });

    const result = await purchaseConsumable(WALLET, "sabotage-device", 3);

    expect(result).toMatchObject({
      ok: true,
      unitPrice: unit,
      totalPrice: unit * 3,
      quantity: 3,
    });
    expect(player().hash).toBe(100_000 - unit * 3);
    expect(fixtureItemQuantities(WALLET)["sabotage-device"]).toBe(3);
  });

  it("charges a price the client cannot influence", async () => {
    seedBuyer({ hash: 100_000 });
    const { itemId, quantity } = purchaseConsumableInput.parse({
      itemId: "help-kit",
      quantity: 1,
      price: 1,
    });

    const result = await purchaseConsumable(WALLET, itemId, quantity);

    expect(result.unitPrice).toBe(1);
    expect(100_000 - player().hash).toBe(result.totalPrice);
  });

  it("starts at 1 HASH independently of minerate", async () => {
    seedBuyer({ hash: 100, hashRate: 1 });

    const result = await purchaseConsumable(WALLET, "sabotage-device", 1);

    expect(result).toMatchObject({ ok: true, unitPrice: 1, totalPrice: 1 });
    expect(Number.isInteger(player().hash)).toBe(true);
  });

  it("adds 0.0001 HASH per HASH of emission above 100,000", async () => {
    seedBuyer({ hash: 100_000, hashRate: 1 });
    vi.mocked(getPricingEmission).mockResolvedValue({
      yesterday: 200_000,
      highWater: 200_000,
      day: 1,
    });

    const result = await purchaseConsumable(WALLET, "help-kit", 1);

    // 1 HASH base + 100,000 excess x 0.0001 = 11 HASH.
    expect(result.unitPrice).toBe(11);
  });

  it("refuses with price_changed and charges nothing when the expected price is stale", async () => {
    seedBuyer({ hash: 100_000, hashRate: 100 });

    const result = await purchaseConsumable(WALLET, "help-kit", 1, 5);

    expect(result).toMatchObject({
      ok: false,
      code: "price_changed",
      unitPrice: 1,
    });
    expect(player().hash).toBe(100_000);
    expect(fixtureItemQuantities(WALLET)).toEqual({});
  });

  it("buys normally when the expected price matches", async () => {
    seedBuyer({ hash: 100_000, hashRate: 100 });

    const result = await purchaseConsumable(WALLET, "help-kit", 1, 1);

    expect(result.ok).toBe(true);
  });

  it("rejects when HASH is insufficient and adds nothing", async () => {
    seedBuyer({ hash: 0 });

    const result = await purchaseConsumable(WALLET, "help-kit", 1);

    expect(result).toEqual({ ok: false, error: "Not enough HASH" });
    expect(player().hash).toBe(0);
    expect(fixtureItemQuantities(WALLET)).toEqual({});
  });

  it("rejects an unknown player", async () => {
    const result = await purchaseConsumable("0xNOBODY", "help-kit", 1);
    expect(result).toEqual({ ok: false, error: "Player not found" });
  });

  it("leaves owned units unchanged when a higher emission tier raises later prices", async () => {
    seedBuyer({ hash: 1_000_000, hashRate: 100 });

    const first = await purchaseConsumable(WALLET, "sabotage-device", 2);
    player().stats.hashRate = 2_000;
    vi.mocked(getPricingEmission).mockResolvedValue({
      yesterday: 105_000,
      highWater: 105_000,
      day: 1,
    });
    const second = await purchaseConsumable(WALLET, "sabotage-device", 2);

    expect(first.ok && second.ok).toBe(true);
    expect(second.unitPrice!).toBeGreaterThan(first.unitPrice!);
    expect(fixtureItemQuantities(WALLET)["sabotage-device"]).toBe(4);
    expect(player().hash).toBe(
      1_000_000 - first.totalPrice! - second.totalPrice!,
    );
  });

  it("lets exactly one of two simultaneous purchases succeed when HASH covers only one", async () => {
    const unit = getEmissionShopPrice({
      basePrice: basePrice("help-kit"),
      emission: 0,
    });
    seedBuyer({ hash: unit, hashRate: 100 });

    const results = await Promise.all([
      purchaseConsumable(WALLET, "help-kit", 1),
      purchaseConsumable(WALLET, "help-kit", 1),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(player().hash).toBe(0);
    expect(fixtureItemQuantities(WALLET)["help-kit"]).toBe(1);
  });

  it("prices Sabotage and Help identically for the same buyer, with no target involved", async () => {
    seedBuyer({ hash: 100_000, hashRate: 100 });
    expect(SOCIAL_ECONOMY.consumablePricing.sabotageBasePrice).toBe(
      SOCIAL_ECONOMY.consumablePricing.helpBasePrice,
    );

    const sabotage = await purchaseConsumable(WALLET, "sabotage-device", 1);
    const help = await purchaseConsumable(WALLET, "help-kit", 1);

    expect(sabotage.unitPrice).toBe(help.unitPrice);
    expect(purchaseConsumable.length).toBe(4);
  });

  it("leaves an uncertain grant for ordered-operation review without a blind HASH refund", async () => {
    seedBuyer({ hash: 100_000 });
    vi.spyOn(getFixtureRepositories().items, "grant").mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(purchaseConsumable(WALLET, "help-kit", 2)).rejects.toThrow(
      "db down",
    );

    expect(player().hash).toBe(99_998);
    expect(fixtureItemQuantities(WALLET)).toEqual({});
  });

  it("logs the charged unit price, quantity and pricing emission", async () => {
    seedBuyer({ hash: 100_000, hashRate: 250 });

    const result = await purchaseConsumable(WALLET, "help-kit", 2);

    const [log] = getFixtureState().logs;
    expect(log).toMatchObject({
      type: "shop",
      wallet: WALLET,
      amount: -result.totalPrice!,
      data: {
        itemId: "help-kit",
        quantity: 2,
        unitPrice: result.unitPrice,
        pricedEmission: 0,
      },
    });
  });

  it("does not award Notoriety", async () => {
    seedBuyer();
    await purchaseConsumable(WALLET, "sabotage-device", 5);
    expect(player().notoriety).toBe(0);
  });
  it("charges exactly 6 HASH for three units quoted at 2", async () => {
    seedBuyer({ hash: 6 });
    vi.mocked(getPricingEmission).mockResolvedValue({
      yesterday: 105_000,
      highWater: 105_000,
      day: 1,
    });
    const result = await purchaseConsumable(WALLET, "help-kit", 3, 2);
    expect(result).toMatchObject({ ok: true, unitPrice: 2, totalPrice: 6 });
    expect(player().hash).toBe(0);
    expect(getFixtureState().logs[0].amount).toBe(-6);
    expect(fixtureItemQuantities(WALLET)["help-kit"]).toBe(3);
  });
  it("changing buyer and network minerate never changes a unit price", async () => {
    seedBuyer();
    const first = await purchaseConsumable(WALLET, "help-kit", 1);
    player().stats.hashRate = 1_000_000;
    const second = await purchaseConsumable(WALLET, "help-kit", 1);
    expect(first.unitPrice).toBe(second.unitPrice);
  });
  it.each([1, 2, 45])(
    "accepts a whole-HASH expected price %s in the event schema",
    (expectedUnitPrice) => {
      expect(
        purchaseConsumableInput.safeParse({
          itemId: "help-kit",
          quantity: 1,
          expectedUnitPrice,
        }).success,
      ).toBe(true);
    },
  );
  it.each([1.01, 0, Infinity, NaN])(
    "rejects invalid expected price %s in the event schema",
    (expectedUnitPrice) => {
      expect(
        purchaseConsumableInput.safeParse({
          itemId: "help-kit",
          quantity: 1,
          expectedUnitPrice,
        }).success,
      ).toBe(false);
    },
  );
});
vi.mock("@/lib/modules/players/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/players/server.repository")
  >()),
  get playerRepository() {
    return getFixtureRepositories().players;
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
vi.mock("@/lib/modules/items/server.repository", () => ({
  get inventoryItemRepository() {
    return getFixtureRepositories().items;
  },
}));
