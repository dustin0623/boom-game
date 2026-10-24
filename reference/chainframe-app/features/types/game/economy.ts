import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";

const nonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/** Daily HASH withdrawal capacity: `10 + notoriety x 0.10`. Not yet rounded. */
export const withdrawalCapacity = (notoriety: number): number =>
  SOCIAL_ECONOMY.baseWithdrawal +
  nonNegative(notoriety) * SOCIAL_ECONOMY.withdrawalNotorietyRate;
