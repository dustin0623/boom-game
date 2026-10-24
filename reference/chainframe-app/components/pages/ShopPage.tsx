"use client";

import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/features/stores/authStore";

import { ConsumableCard } from "@/components/cards/ConsumableCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { EquipmentChestPurchaseCard } from "@/components/shop/EquipmentChestPurchaseCard";
import {
  CONSUMABLE_IDS,
  CONSUMABLES,
  consumableQuantity,
  type ConsumableId,
} from "@/features/types/game/consumables";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { useWorkerStore } from "@/features/stores/workerStore";
import { useGameStats } from "@/hooks/useGameStats";
import { useShopPrices } from "@/hooks/useShopPrices";
import { useHiveShopPurchase } from "@/hooks/useHiveShopPurchase";
import * as api from "@/lib/api/client";
import { notify } from "@/lib/notify";
import { getHivePurchaseTotal } from "@/lib/utils/game/pricing";

export function ShopPage() {
  const workerAvailable = useWorkerStore((state) => state.available);
  const { wallet } = useGameStats();
  const {
    consumablePrice,
    consumableHivePrice,
    consumableOwned,
    refresh,
    unavailable,
  } = useShopPrices();
  const storeConsumables = useInventoryStore((state) => state.items);
  const inventoryLoaded = useInventoryStore((state) => state.loaded);
  const inventoryError = useInventoryStore((state) => state.error);

  const hiveShop = useHiveShopPurchase();
  const [hiveBuyingId, setHiveBuyingId] = useState<ConsumableId | null>(null);
  const [buyingId, setBuyingId] = useState<ConsumableId | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const capture = () => {
    const origin = useAuthStore.getState();
    return () => {
      const state = useAuthStore.getState();
      return (
        mounted.current &&
        state.address === origin.address &&
        state.connectedAt === origin.connectedAt &&
        state.mode === origin.mode
      );
    };
  };

  const handleBuy = async (itemId: ConsumableId, quantity: number) => {
    const current = capture();
    let submitted = false;
    if (buyingId) return;
    setBuyingId(itemId);
    try {
      const result = await api.purchaseConsumable(
        itemId,
        quantity,
        consumablePrice(itemId) ?? undefined,
        () => {
          submitted = true;
        },
      );
      if (!current()) return;
      if (!result.ok) {
        if (!submitted) notify(result.error ?? "Purchase failed", "danger");
        return;
      }
      await refresh();
    } finally {
      if (current()) setBuyingId(null);
    }
  };

  const handleBuyWithHive = async (itemId: ConsumableId, quantity: number) => {
    const current = capture();
    let submitted = false;
    const unit = consumableHivePrice(itemId);
    if (hiveShop.busy || unit === null) return;
    setHiveBuyingId(itemId);
    try {
      const outcome = await hiveShop.buy(
        {
          kind: "consumable",
          itemId,
          quantity,
          hiveAmount: getHivePurchaseTotal(unit, quantity),
        },
        () => {
          submitted = true;
        },
      );
      if (!current()) return;
      if (!outcome.ok) {
        if (!submitted) notify(outcome.error, "danger");
        return;
      }
      await refresh();
    } finally {
      if (current()) setHiveBuyingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop"
        description="The Equipment Chest, Sabotage Devices and Help Kits. HASH prices follow the highest completed day's global emission; HIVE prices stay fixed."
      />

      {unavailable ? (
        <p className="text-xs text-danger" role="alert">
          Live prices are unavailable right now. Try again shortly.
        </p>
      ) : null}

      <div
        aria-label="Shop products"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <EquipmentChestPurchaseCard />
        {CONSUMABLE_IDS.map((id) => (
          <ConsumableCard
            key={id}
            consumable={CONSUMABLES[id]}
            unitPrice={consumablePrice(id)}
            owned={
              inventoryError
                ? null
                : inventoryLoaded
                  ? consumableQuantity(storeConsumables, id)
                  : consumableOwned(id)
            }
            wallet={wallet}
            busy={buyingId === id}
            purchasable={workerAvailable === true}
            unavailable={workerAvailable !== true}
            onBuy={(itemId, quantity) => void handleBuy(itemId, quantity)}
            hiveUnitPrice={consumableHivePrice(id)}
            hiveBusy={hiveShop.busy || hiveBuyingId === id}
            onBuyWithHive={(itemId, quantity) =>
              void handleBuyWithHive(itemId, quantity)
            }
          />
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Buy chests here, then open them one at a time in Inventory. Luck applies
        when opening. Use the info button for base rarity odds.
      </p>
    </div>
  );
}
