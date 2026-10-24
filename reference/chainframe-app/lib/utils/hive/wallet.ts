import { hiveClient } from "@/lib/chains/modules/hive/client";

export function getHiveTreasuryAccount(): string {
  return process.env.NEXT_PUBLIC_HIVE_TREASURY_ACCOUNT ?? "";
}
export function getHiveMarketAccount(): string {
  return process.env.NEXT_PUBLIC_HIVE_MARKET_ACCOUNT ?? "";
}
export function isMarketPaymentConfigured(): boolean {
  return hiveClient.keychain.isAvailable() && getHiveMarketAccount().length > 0;
}
