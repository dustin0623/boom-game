import { describe, expect, it } from "vitest";
import {
  HIGH_WATER_KEY,
  LAST_RATCHET_KEY,
  utcDayNumber,
  emissionDayKey,
  emissionKeyForTime,
  emissionExcess,
  emissionMultiplier,
  getEmissionShopPrice,
  getShopHiveAmount,
  getShopPurchaseTotal,
  getShopPriceShortfall,
  shopUnitPriceSchema,
  hiveAmountSchema,
  getHivePurchaseTotal,
  getMarketAmounts,
  toMilliHive,
  toHiveQuantity,
  getHashReferralReward,
  getHiveReferralMilli,
} from "@/lib/utils/game/pricing";
import { formatShopPrice } from "@/lib/format";

const chest = (emission: number) =>
  getEmissionShopPrice({ basePrice: 100, emission });
const consumable = (emission: number) =>
  getEmissionShopPrice({ basePrice: 1, emission });

describe("currency-paid referral rewards", () => {
  it("uses exact HASH totals rather than whole-HASH per-unit rounding", () => {
    expect(getHashReferralReward(150)).toBe(7.5);
    expect(getHashReferralReward(1)).toBe(0.05);
    expect(getHashReferralReward(getShopPurchaseTotal(110, 3))).toBe(16.5);
    expect(() => getHashReferralReward(Number.MAX_SAFE_INTEGER)).toThrow("Unsafe");
    for (const invalid of [0, -1, 1.1, NaN, Infinity]) expect(() => getHashReferralReward(invalid)).toThrow();
  });
  it("floors HIVE at the milli boundary on the actual payment", () => {
    expect(getHiveReferralMilli(150)).toBe(7500);
    expect(getHiveReferralMilli(10)).toBe(500);
    expect(getHiveReferralMilli(0.1)).toBe(5);
    expect(getHiveReferralMilli(0.001)).toBe(0);
    expect(getHiveReferralMilli(250)).toBe(12500);
    expect(() => getHiveReferralMilli(0.0001)).toThrow();
  });
});

describe("emission day identity", () => {
  it("preserves ratchet document keys", () => {
    expect(HIGH_WATER_KEY).toBe("priceEmissionHighWater");
    expect(LAST_RATCHET_KEY).toBe("priceEmissionLastDay");
  });

  it("changes keys exactly at midnight UTC across the year boundary", () => {
    const midnight = Date.parse("2027-01-01T00:00:00.000Z");
    expect(emissionKeyForTime(midnight - 1)).toBe("emission:2026-12-31");
    expect(emissionKeyForTime(midnight)).toBe("emission:2027-01-01");
    expect(emissionDayKey(utcDayNumber(midnight))).toBe(
      emissionKeyForTime(midnight),
    );
    expect(utcDayNumber(midnight - 1) + 1).toBe(utcDayNumber(midnight));
  });
});

describe("network emission shop prices", () => {
  it.each([
    [0, 100, 1],
    [99_999, 100, 1],
    [100_000, 100, 1],
    [100_001, 100, 1],
    [100_005, 100, 1],
    [100_499, 105, 1],
    [100_500, 105, 1],
    [101_000, 110, 1],
    [105_000, 150, 2],
    [110_000, 200, 2],
    [150_000, 600, 6],
    [200_000, 1_100, 11],
    [1_100_000, 10_100, 101],
  ])(
    "emission %s charges %s for a chest and %s for a consumable",
    (emission, chestPrice, consumablePrice) => {
      expect(chest(emission)).toBe(chestPrice);
      expect(consumable(emission)).toBe(consumablePrice);
    },
  );

  it("rounds fractional emission half-up to whole HASH without first rounding the chest", () => {
    expect(chest(100_049.999)).toBe(100);
    expect(chest(100_050)).toBe(101);
    expect(consumable(104_999.999999)).toBe(1);
    expect(consumable(105_000)).toBe(2);
    // Rounding the chest first would incorrectly round this consumable upward.
    expect(chest(104_999)).toBe(150);
    expect(consumable(104_999)).toBe(1);
    expect(consumable(115_000)).toBe(3);
  });

  it("uses the same percentage uplift for both unrounded bases", () => {
    expect(emissionExcess(99_999)).toBe(0);
    expect(emissionExcess(101_000)).toBe(1_000);
    expect(emissionMultiplier(101_000)).toBe(1.1);
    expect(emissionMultiplier(200_000)).toBe(11);
  });

  it("never lowers either price as the pricing tier increases", () => {
    const tiers = [
      0, 99_999, 100_000, 100_005, 101_000, 110_000, 200_000, 9_999_999,
    ];
    for (const price of [chest, consumable]) {
      const prices = tiers.map(price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      for (const value of prices)
        expect(shopUnitPriceSchema.safeParse(value).success).toBe(true);
    }
  });

  it.each([-1, NaN, Infinity, -Infinity])(
    "treats invalid emission %s as no excess",
    (emission) => {
      expect(emissionExcess(emission)).toBe(0);
      expect(chest(emission)).toBe(100);
      expect(consumable(emission)).toBe(1);
    },
  );

  it.each([NaN, Infinity, -Infinity, -5, 0])(
    "preserves the minimum for invalid base %s",
    (basePrice) => {
      expect(getEmissionShopPrice({ basePrice, emission: 0 })).toBe(1);
    },
  );
  it("does not add arithmetic noise to a large integer unit price", () => {
    expect(
      getEmissionShopPrice({ basePrice: Number.MAX_SAFE_INTEGER, emission: 0 }),
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(() =>
      getEmissionShopPrice({
        basePrice: Number.MAX_SAFE_INTEGER,
        emission: 200_000,
      }),
    ).toThrow(/safe integer/);
  });
});

describe("whole-HASH and milli-HIVE purchase amounts", () => {
  it.each([1, 2, 4, 45, 100, 101, Number.MAX_SAFE_INTEGER])(
    "accepts valid expected price %s",
    (price) => {
      expect(shopUnitPriceSchema.parse(price)).toBe(price);
    },
  );
  it.each([
    0,
    -1,
    NaN,
    Infinity,
    0.1,
    1.01,
    1.11,
    1.10000000001,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid expected price %s", (price) => {
    expect(shopUnitPriceSchema.safeParse(price).success).toBe(false);
  });
  it("calculates exact integer HASH and milli-HIVE totals and rejects unsafe products", () => {
    expect(getShopPurchaseTotal(2, 3)).toBe(6);
    expect(getShopPurchaseTotal(1, 3)).toBe(3);
    expect(getShopPurchaseTotal(2, 25)).toBe(50);
    expect(getHivePurchaseTotal(0.1, 3)).toBe(0.3);
    expect(getHivePurchaseTotal(0.101, 3)).toBe(0.303);
    expect(() => getShopPurchaseTotal(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      /unsafe/,
    );
    expect(() => getHivePurchaseTotal(9_000_000_000_000, 2)).toThrow(/unsafe/);
  });
  it("rounds shortfalls upward while removing subtraction noise", () => {
    expect(getShopPriceShortfall(1.1, 1)).toBe(0.1);
    expect(getShopPriceShortfall(1.1, 1.05)).toBe(0.05);
    expect(getShopPriceShortfall(3.3, 3.2)).toBe(0.1);
    expect(getShopPriceShortfall(1.1, 1.099999)).toBe(0.0001);
    expect(getShopPriceShortfall(1.1, 2)).toBe(0);
  });
  it("keeps HIVE prices fixed and preserves quantity limits", () => {
    expect(getShopHiveAmount("chest", "equipment", 1)).toBe(10);
    expect(getShopHiveAmount("consumable", "sabotage-device", 1)).toBe(0.1);
    expect(getShopHiveAmount("consumable", "help-kit", 3)).toBe(0.3);
    expect(getShopHiveAmount("consumable", "help-kit", 25)).toBe(2.5);
    expect(getShopHiveAmount("consumable", "help-kit", 26)).toBeNull();
    expect(getShopHiveAmount("chest", "equipment", 2)).toBe(20);
    expect(getShopHiveAmount("chest", "equipment", 25)).toBe(250);
    expect(getShopHiveAmount("chest", "equipment", 26)).toBeNull();
  });
  it("shows full amounts even when large and removes trailing zeros", () => {
    expect(formatShopPrice(1)).toBe("1");
    expect(formatShopPrice(1.1)).toBe("1.1");
    expect(formatShopPrice(100_000.1)).toBe("100,000.1");
  });
  it.each([0.001, 0.1, 0.101, 1, 9_000_000_000_000])(
    "accepts exact safe HIVE amount %s",
    (value) => {
      expect(hiveAmountSchema.parse(value)).toBe(value);
    },
  );
  it.each([0, -1, Infinity, NaN, 0.0001, 0.1001, 9_100_000_000_000])(
    "rejects invalid HIVE amount %s",
    (value) => {
      expect(hiveAmountSchema.safeParse(value).success).toBe(false);
    },
  );
  it("floors market fees in milli-HIVE without overflowing intermediate multiplication", () => {
    expect(getMarketAmounts(0.1)).toEqual({ fee: 0.005, proceeds: 0.095 });
    expect(getMarketAmounts(0.001)).toEqual({ fee: 0, proceeds: 0.001 });
    const price = 9_000_000_000_000;
    const amounts = getMarketAmounts(price);
    expect(toMilliHive(amounts.fee) + toMilliHive(amounts.proceeds)).toBe(
      toMilliHive(price),
    );
    expect(amounts.fee).toBe(450_000_000_000);
  });
  it("serializes large safe milli-HIVE without the binary toFixed rounding drift", () => {
    expect(toHiveQuantity(9007199254740.812)).toBe("9007199254740.812");
    expect(toHiveQuantity(getMarketAmounts(9007199254740.812).proceeds)).toBe(
      "8556839292003.772",
    );
    expect(toHiveQuantity(getHivePurchaseTotal(0.1, 3))).toBe("0.300");
  });
});
