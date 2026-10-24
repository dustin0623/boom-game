"use client";

import type {
  ChestResult,
  EquipmentDto,
  MarketListingDto,
  LogDto,
  PendingTxDto,
  SettledTxDto,
  PlayerDto,
  PurchaseConsumableResult,
  ShopPricesDto,
  GameStatsMetric,
  GameStatsSummaryDto,
  GameStatsDailyDto,
  LeaderboardDto,
  LeaderboardQuery,
  ReferralsDto,
} from "./types";
import { submitSignedGameAction } from "@/features/events/frontend/broadcast-game-action/submit";
import { LEADERBOARD_WEIGHTS } from "./types";

export class ApiError extends Error {
  constructor(
    public override message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let token: string | null = null;
export function setAuthToken(newToken: string | null) {
  token = newToken;
  if (newToken) {
    localStorage.setItem("chainframe.token", newToken);
  } else {
    localStorage.removeItem("chainframe.token");
  }
}

export function loadAuthToken(): string | null {
  if (!token) {
    token = localStorage.getItem("chainframe.token");
  }
  return token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const currentToken = loadAuthToken();
  if (currentToken) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message || response.statusText, response.status);
  }

  return (await response.json()) as T;
}

export async function fetchReferrals(context: { isCurrent: () => boolean }): Promise<ReferralsDto> {
  if (!context.isCurrent()) throw new Error("Wallet session changed");
  try {
    const result = await request<ReferralsDto>("/api/player/referrals", { cache: "no-store" });
    if (!context.isCurrent()) throw new Error("Wallet session changed");
    if (!result.ok || !Array.isArray(result.referred) || !Number.isFinite(result.referralHiveEarned))
      throw new Error("Unable to read referrals");
    return result;
  } catch (error) {
    if (!context.isCurrent()) throw new Error("Wallet session changed");
    throw error;
  }
}

export async function fetchLeaderboard(
  context: LeaderboardQuery & {
    isCurrent: () => boolean;
    signal?: AbortSignal;
  },
): Promise<LeaderboardDto> {
  if (!context.isCurrent()) throw new Error("Wallet session changed");
  try {
    const result = await request<LeaderboardDto>(
      `/api/game/leaderboard?page=${context.page}`,
      { cache: "no-store", signal: context.signal },
    );
    if (!context.isCurrent()) throw new Error("Wallet session changed");
    if (
      !result.ok ||
      result.page !== context.page ||
      result.weights?.notoriety !== LEADERBOARD_WEIGHTS.notoriety ||
      result.weights?.mining !== LEADERBOARD_WEIGHTS.mining ||
      result.weights?.progression !== LEADERBOARD_WEIGHTS.progression
    )
      throw new Error("Unable to read leaderboard");
    return result;
  } catch (error) {
    if (!context.isCurrent()) throw new Error("Wallet session changed");
    throw error;
  }
}

type GameStatsRequest = {
  isCurrent: () => boolean;
  metric?: GameStatsMetric;
  days?: 7 | 30 | 90;
  signal?: AbortSignal;
};
export function fetchGameStats(
  context: GameStatsRequest & { metric: GameStatsMetric },
): Promise<GameStatsDailyDto>;
export function fetchGameStats(
  context: GameStatsRequest & { metric?: undefined },
): Promise<GameStatsSummaryDto>;
export function fetchGameStats(
  context: GameStatsRequest,
): Promise<GameStatsSummaryDto | GameStatsDailyDto>;
export async function fetchGameStats(
  context: GameStatsRequest,
): Promise<GameStatsSummaryDto | GameStatsDailyDto> {
  if (!context.isCurrent()) throw new Error("Wallet session changed");
  const query = context.metric
    ? `?metric=${encodeURIComponent(context.metric)}&days=${context.days ?? 30}`
    : "";
  try {
    const result = await request<GameStatsSummaryDto | GameStatsDailyDto>(
      `/api/game/stats${query}`,
      { signal: context.signal, cache: "no-store" },
    );
    if (!context.isCurrent()) throw new Error("Wallet session changed");
    if (
      result.ok !== true ||
      result.kind !== (context.metric ? "daily" : "summary")
    )
      throw new Error("Unable to read game statistics");
    return result;
  } catch (error) {
    if (!context.isCurrent()) throw new Error("Wallet session changed");
    throw error;
  }
}

export async function generateChallenge(
  wallet: string,
): Promise<{ ok: boolean; nonce?: string; error?: string }> {
  try {
    return await request<{ ok: boolean; nonce: string }>(
      "/api/auth/challenge",
      {
        method: "POST",
        body: JSON.stringify({ wallet }),
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function verifySignature(
  wallet: string,
  signature: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    return await request<{ ok: boolean; token: string }>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ wallet, signature }),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function getMe(refUsername?: string | null): Promise<{
  ok: boolean;
  player?: PlayerDto;
  error?: string;
}> {
  try {
    const query = refUsername ? `?${new URLSearchParams({ ref: refUsername })}` : "";
    return await request<{ ok: boolean; player: PlayerDto }>(`/api/player/me${query}`, {
      method: "GET",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function openChest(
  chest: string,
  onSubmitted?: () => void,
): Promise<ChestResult> {
  try {
    return await submitSignedGameAction(
      "open_chest",
      {
        itemId: chest,
      },
      onSubmitted,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Server-calculated shared emission prices and wallet-specific owned counts. */
export async function getShopPrices(): Promise<{
  ok: boolean;
  prices?: ShopPricesDto;
  error?: string;
}> {
  try {
    const result = await request<{ ok: boolean } & ShopPricesDto>(
      "/api/shop/prices",
      { method: "GET" },
    );
    if (!result.ok) return { ok: false, error: "Prices unavailable" };
    const {
      globalMinerate,
      chests,
      chestOwned,
      chestHivePrice,
      asOf,
      playerMinerate,
      consumables,
      emission,
    } = result;
    return {
      ok: true,
      prices: {
        globalMinerate,
        chests,
        chestOwned,
        chestHivePrice,
        asOf,
        playerMinerate,
        consumables,
        emission,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Buys consumables; the optional displayed price only guards against a changed quote. */
export async function purchaseChest(
  itemId: string,
  quantity: number,
  expectedUnitPrice?: number,
  onSubmitted?: () => void,
): Promise<PurchaseConsumableResult> {
  try {
    return await submitSignedGameAction(
      "purchase_chest",
      {
        itemId,
        quantity,
        ...(expectedUnitPrice === undefined ? {} : { expectedUnitPrice }),
      },
      onSubmitted,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function purchaseConsumable(
  itemId: string,
  quantity: number,
  expectedUnitPrice?: number,
  onSubmitted?: () => void,
): Promise<PurchaseConsumableResult> {
  try {
    return await submitSignedGameAction(
      "purchase_consumable",
      {
        itemId,
        quantity,
        ...(expectedUnitPrice === undefined ? {} : { expectedUnitPrice }),
      },
      onSubmitted,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function getRaidTargets(hackPower: number): Promise<{
  ok: boolean;
  rivals?: import("@/features/types/game/types").Rival[];
  error?: string;
}> {
  try {
    return await request<{
      ok: boolean;
      rivals: import("@/features/types/game/types").Rival[];
    }>(`/api/game/raid/targets?defense=${hackPower}`, { method: "GET" });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function getInventory(): Promise<{
  ok: boolean;
  equipments?: EquipmentDto[];
  items?: import("@/lib/api/types").InventoryItemDto[];
  error?: string;
}> {
  try {
    return await request<{
      ok: boolean;
      equipments: EquipmentDto[];
      items: import("@/lib/api/types").InventoryItemDto[];
    }>("/api/items", {
      method: "GET",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Marketplace listings require an authenticated wallet. */
export async function getMarketListings(): Promise<{
  ok: boolean;
  listings?: MarketListingDto[];
  error?: string;
}> {
  try {
    return await request<{ ok: boolean; listings: MarketListingDto[] }>(
      "/api/market",
      {
        cache: "no-store",
        ...(typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? { signal: AbortSignal.timeout(8000) }
          : {}),
      },
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function listMarketItem(
  refId: string,
  price: number,
  onSubmitted?: () => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await submitSignedGameAction(
      "market_list",
      { itemId: refId, price, currency: "HIVE" },
      onSubmitted,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function cancelMarketListing(
  refId: string,
  onSubmitted?: () => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await submitSignedGameAction(
      "market_cancel",
      { itemId: refId },
      onSubmitted,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

type LogsResponse = {
  ok: boolean;
  logs?: LogDto[];
  nextCursor?: string | null;
  latestCursor?: string | null;
  error?: string;
};

async function fetchLogs(path: string): Promise<LogsResponse> {
  try {
    return await request<{ ok: boolean; logs: LogDto[] }>(path, {
      method: "GET",
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** The signed-in player's gameplay activity feed (claims, chests, raids, upgrades). */
export function getActivityLogs(
  limit = 50,
  cursor?: string,
  direction: "older" | "newer" = "older",
  category?: import("./types").PersonalHistoryCategory,
): Promise<LogsResponse> {
  return fetchLogs(
    `/api/logs?limit=${limit}&direction=${direction}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${category ? `&category=${encodeURIComponent(category)}` : ""}`,
  );
}

/** All recorded marketplace actions involving the authenticated player. */
export function getPersonalMarketHistory(limit = 100): Promise<LogsResponse> {
  return fetchLogs(`/api/logs/market?limit=${limit}`);
}

/** Authenticated history of completed marketplace sales. */
export async function getMarketSales(limit = 25): Promise<LogsResponse> {
  try {
    return await request<LogsResponse>(
      `/api/logs/market/sales?limit=${limit}`,
      { cache: "no-store" },
    );
  } catch {
    return { ok: false, error: "Market sales unavailable" };
  }
}

export async function withdraw(
  amount: number,
  onSubmitted?: () => void,
): Promise<{
  ok: boolean;
  queued?: boolean;
  jobId?: string;
  signature?: string;
  amount?: number;
  remaining?: number;
  dailyCap?: number;
  resetAt?: number;
  error?: string;
}> {
  try {
    return await submitSignedGameAction(
      "request_withdrawal",
      { amount },
      onSubmitted,
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** The signed-in Hive account's HASH token balance, or selected native HIVE balance. */
export async function getWalletBalance(
  asset: "HASH" | "HIVE" = "HASH",
): Promise<{
  ok: boolean;
  balance?: number;
  error?: string;
}> {
  try {
    const { useAuthStore } = await import("@/features/stores/authStore");
    const session = useAuthStore.getState();
    if (session.mode !== "wallet" || !session.address)
      return { ok: false, error: "Connect your wallet first" };
    const result = await request<{ ok: boolean; balance: number }>(
      asset === "HIVE"
        ? "/api/wallet/balance?asset=HIVE"
        : "/api/wallet/balance",
      { method: "GET" },
    );
    const current = useAuthStore.getState();
    if (
      current.address !== session.address ||
      current.mode !== session.mode ||
      current.connectedAt !== session.connectedAt
    )
      return { ok: false, error: "Wallet session changed" };
    return result;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Authenticated read of the treasury's public on-chain HASH balance. */
export async function getTreasuryBalance(): Promise<{
  ok: boolean;
  balance?: number;
  error?: string;
}> {
  try {
    return await request<{ ok: boolean; balance: number }>(
      "/api/wallet/treasury-balance",
      { cache: "no-store" },
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getTransactions(
  limit = 25,
  cursor?: string,
  direction: "older" | "newer" = "older",
): Promise<{
  ok: boolean;
  pending?: PendingTxDto[];
  history?: SettledTxDto[];
  nextCursor?: string | null;
  latestCursor?: string | null;
  error?: string;
}> {
  try {
    return await request<{
      ok: boolean;
      pending: PendingTxDto[];
      history: SettledTxDto[];
    }>(
      `/api/transactions?limit=${limit}&direction=${direction}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { method: "GET" },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Authenticate the captured cache session before fetching and before publishing prices. */
export async function fetchShopPrices(context: {
  isCurrent: () => boolean;
}): Promise<ShopPricesDto> {
  if (!context.isCurrent()) throw new Error("Wallet session changed");
  const result = await getShopPrices();
  if (!context.isCurrent()) throw new Error("Wallet session changed");
  if (!result.ok || !result.prices)
    throw new Error(result.error ?? "Prices unavailable");
  return result.prices;
}
