import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import {
  MARKET_FEE_BPS,
  REFERRAL_REWARD_BPS,
  EQUIPMENT_CHEST_HIVE_PRICE,
  EQUIPMENT_CHEST_ID,
} from "@/lib/config/constants/game";
import {
  CONSUMABLE_HIVE_PRICE,
  MAX_PURCHASE_QUANTITY,
  isConsumableId,
} from "@/features/types/game/consumables";
import { z } from "zod";
import { MAX_CHEST_PURCHASE_QUANTITY } from "@/features/types/game/inventory";

const { pricing } = SOCIAL_ECONOMY;

const nonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/** Half-up to whole HASH, tolerating arithmetic noise at a rounding boundary. */
const toShopPrice = (raw: number): number => {
  if (!Number.isFinite(raw)) return pricing.minPrice;
  const fraction = raw - Math.floor(raw);
  const noise = Math.min(1e-8, Number.EPSILON * Math.max(1, Math.abs(raw)));
  const rounded = Math.max(
    pricing.minPrice,
    Math.round(raw) + (fraction < 0.5 && 0.5 - fraction <= noise ? 1 : 0),
  );
  if (!Number.isSafeInteger(rounded))
    throw new Error("Shop price exceeds safe integer range");
  return rounded;
};

/** Expected quotes may guard a purchase, but never determine its charge. */
export const shopUnitPriceSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

/** Native HIVE values must be exactly representable in safe integer milli-HIVE. */
export const hiveAmountSchema = z
  .number()
  .finite()
  .positive()
  .refine((value) => {
    const milli = Math.round(value * 1000);
    return Number.isSafeInteger(milli) && value === milli / 1000;
  }, "HIVE amounts must use increments of 0.001 within the safe range");

/** Multiply a rounded unit price by an integer quantity without float drift. */
export const getShopPurchaseTotal = (
  unitPrice: number,
  quantity: number,
): number => {
  shopUnitPriceSchema.parse(unitPrice);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !Number.isSafeInteger(unitPrice * quantity)
  )
    throw new Error("Invalid or unsafe shop purchase total");
  return unitPrice * quantity;
};

/** Whole-HASH charges yield exact hundredth-HASH rewards; validate before spending. */
export function getHashReferralReward(total: number): number {
  shopUnitPriceSchema.parse(total);
  const cents = (BigInt(total) * BigInt(REFERRAL_REWARD_BPS)) / 100n;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Unsafe referral total");
  return Number(cents) / 100;
}

/** Native rewards floor once on the actual total, never per purchased unit. */
export function getHiveReferralMilli(total: number): number {
  return Number((BigInt(toMilliHive(total)) * BigInt(REFERRAL_REWARD_BPS)) / 10000n);
}

export function getHivePurchaseTotal(
  unitPrice: number,
  quantity: number,
): number {
  const milli = toMilliHive(unitPrice);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !Number.isSafeInteger(milli * quantity)
  )
    throw new Error("Invalid or unsafe HIVE purchase total");
  return (milli * quantity) / 1000;
}

/** Exact 5% market fee, floored to milli-HIVE; BigInt prevents intermediate overflow. */
export function getMarketAmounts(price: number): {
  fee: number;
  proceeds: number;
} {
  const milli = toMilliHive(price);
  const fee = Number((BigInt(milli) * BigInt(MARKET_FEE_BPS)) / 10000n);
  return { fee: fee / 1000, proceeds: (milli - fee) / 1000 };
}

/** Round displayed HASH shortfalls upward to four decimals, excluding float noise. */
export const getShopPriceShortfall = (
  total: number,
  balance: number,
): number => {
  const units = (total - balance) * 10000;
  const noise =
    Number.EPSILON *
    Math.max(1, Math.abs(total) * 10000, Math.abs(balance) * 10000);
  return Math.max(0, Math.ceil(units - noise) / 10000);
};

/** HASH of daily emission above the threshold. Zero at or below it. */
export const emissionExcess = (emission: number): number =>
  Math.max(0, nonNegative(emission) - pricing.emissionThresholdPerDay);

/**
 * Network price multiplier, shared by every HASH price. 1 at or below the
 * threshold, then +`excessRate / referencePrice` per HASH of excess emission.
 */
export const emissionMultiplier = (emission: number): number =>
  1 + (emissionExcess(emission) * pricing.excessRate) / pricing.referencePrice;

export interface EmissionShopPriceInput {
  basePrice: number;
  /** Emission (HASH per day) that sets today's price tier. */
  emission: number;
}

/** Shared network-emission uplift, rounded directly from each product's base. */
export const getEmissionShopPrice = ({
  basePrice,
  emission,
}: EmissionShopPriceInput): number =>
  toShopPrice(nonNegative(basePrice) * emissionMultiplier(emission));

export type HiveShopKind = "chest" | "consumable";

/** Hive amounts carry 3 decimals; compare in integer milli-HIVE to avoid float drift. */
export const toMilliHive = (amount: number): number =>
  Math.round(hiveAmountSchema.parse(amount) * 1000);

/** Three-decimal wire quantity from integer milli-HIVE, including large safe amounts. */
export function toHiveQuantity(amount: number): string {
  const milli = BigInt(toMilliHive(amount));
  return `${milli / 1000n}.${String(milli % 1000n).padStart(3, "0")}`;
}

/** Fixed HIVE amounts; invalid products or quantities never use client quotes. */
export function getShopHiveAmount(
  kind: HiveShopKind,
  itemId: string,
  quantity: number,
): number | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  if (kind === "chest") {
    if (itemId !== EQUIPMENT_CHEST_ID || quantity > MAX_CHEST_PURCHASE_QUANTITY)
      return null;
    return getHivePurchaseTotal(EQUIPMENT_CHEST_HIVE_PRICE, quantity);
  }
  if (!isConsumableId(itemId) || quantity > MAX_PURCHASE_QUANTITY) return null;
  return getHivePurchaseTotal(CONSUMABLE_HIVE_PRICE, quantity);
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const HIGH_WATER_KEY = "priceEmissionHighWater";
export const LAST_RATCHET_KEY = "priceEmissionLastDay";

/** Start of the UTC day containing `ms`, as a day number since the epoch. */
export const utcDayNumber = (ms: number): number => Math.floor(ms / DAY_MS);

/** Stat key holding the HASH claimed during one UTC day. */
export const emissionDayKey = (dayNumber: number): string =>
  `emission:${new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)}`;

/** Stat key for the day that contains `ms`. */
export const emissionKeyForTime = (ms: number): string =>
  emissionDayKey(utcDayNumber(ms));
