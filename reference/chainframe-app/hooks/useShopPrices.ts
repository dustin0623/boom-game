"use client";

import useSWR from "swr";

import { fetchShopPrices } from "@/lib/api/client";
import { useAuthStore } from "@/features/stores/authStore";
import type { ChestKey } from "@/features/types/game/types";
import type { ConsumableId } from "@/features/types/game/consumables";

const REFRESH_MS = 60_000;

function fetchSessionPrices(key: readonly [string, string, number | null]) {
  return fetchShopPrices({
    isCurrent: () => {
      const current = useAuthStore.getState();
      return (
        current.mode === "wallet" &&
        current.apiConnected === true &&
        current.address === key[1] &&
        current.connectedAt === key[2]
      );
    },
  });
}

/** Authenticated, session-scoped prices; unavailable until the server answers. */
export function useShopPrices() {
  const authenticated = useAuthStore((state) => state.apiConnected === true);
  const mode = useAuthStore((state) => state.mode);
  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);

  const { data, error, mutate } = useSWR(
    mode === "wallet" && authenticated && address
      ? (["shop-prices", address, connectedAt] as const)
      : null,
    fetchSessionPrices,
    {
      refreshInterval: REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: false,
    },
  );

  const chestPrice = (chest: ChestKey): number | null => {
    return data?.chests[chest] ?? null;
  };

  /** Shared emission-based unit price; null until the server has answered. */
  const consumablePrice = (id: ConsumableId): number | null =>
    data?.consumables?.[id]?.price ?? null;

  /** Server-reported owned count; null until the server has answered. */
  const consumableOwned = (id: ConsumableId): number | null =>
    data?.consumables?.[id]?.owned ?? null;

  /** Fixed HIVE price of the Equipment Chest; null until the server has answered. */
  const chestHivePrice = (): number | null => data?.chestHivePrice ?? null;

  /** Fixed HIVE price of one consumable; null until the server has answered. */
  const consumableHivePrice = (id: ConsumableId): number | null =>
    data?.consumables?.[id]?.hivePrice ?? null;

  return {
    chestOwned: (chest: ChestKey): number | null => data?.chestOwned?.[chest] ?? null,
    chestHivePrice,
    consumableHivePrice,
    chestPrice,
    consumablePrice,
    consumableOwned,
    emission: data?.emission ?? null,
    refresh: () => mutate(),
    loading: mode === "wallet" && !data && !error,
    unavailable: !data && (mode !== "wallet" || Boolean(error)),
  };
}
