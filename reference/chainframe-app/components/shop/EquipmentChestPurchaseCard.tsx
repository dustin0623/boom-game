"use client";
import { useEffect, useRef, useState } from "react";
import { ChestCard } from "@/components/cards/ChestCard";
import { EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import { useAuthStore } from "@/features/stores/authStore";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { useWorkerStore } from "@/features/stores/workerStore";
import { useGameStats } from "@/hooks/useGameStats";
import { useShopPrices } from "@/hooks/useShopPrices";
import { useHiveShopPurchase } from "@/hooks/useHiveShopPurchase";
import { getHivePurchaseTotal } from "@/lib/utils/game/pricing";
import { purchaseChest } from "@/lib/api/client";
import { notify } from "@/lib/notify";
export function EquipmentChestPurchaseCard() {
  const { wallet } = useGameStats();
  const prices = useShopPrices();
  const hiveShop = useHiveShopPurchase();
  const available = useWorkerStore((s) => s.available === true);
  const items = useInventoryStore((s) => s.items);
  const loaded = useInventoryStore((s) => s.loaded);
  const error = useInventoryStore((s) => s.error);
  const [busy, setBusy] = useState(false);
  const sessionKey = useAuthStore((s) =>
    JSON.stringify([s.mode, s.address, s.connectedAt]),
  );
  useEffect(() => {
    setBusy(false);
  }, [sessionKey]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const buy = async (quantity: number, hive: boolean) => {
    if (busy || hiveShop.busy) return;
    const origin = useAuthStore.getState();
    const current = () => {
      const state = useAuthStore.getState();
      return (
        mounted.current &&
        state.apiConnected &&
        state.address === origin.address &&
        state.mode === origin.mode &&
        state.connectedAt === origin.connectedAt
      );
    };
    const unit = hive
      ? prices.chestHivePrice()
      : prices.chestPrice(EQUIPMENT_CHEST_ID);
    if (unit === null || !available || !origin.isRegistered) return;
    let submitted = false;
    setBusy(true);
    try {
      const onSubmitted = () => {
        submitted = true;
      };
      const result = hive
        ? await hiveShop.buy(
            {
              kind: "chest",
              itemId: EQUIPMENT_CHEST_ID,
              quantity,
              hiveAmount: getHivePurchaseTotal(unit, quantity),
            },
            onSubmitted,
          )
        : await purchaseChest(EQUIPMENT_CHEST_ID, quantity, unit, onSubmitted);
      if (!current()) return;
      if (!result.ok) {
        if (!submitted) notify(result.error ?? "Purchase failed", "danger");
        return;
      }
      await prices.refresh();
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <ChestCard
      chest={EQUIPMENT_CHEST_ID}
      wallet={wallet}
      price={prices.chestPrice(EQUIPMENT_CHEST_ID)}
      owned={
        error
          ? null
          : loaded
            ? (items[EQUIPMENT_CHEST_ID] ?? 0)
            : prices.chestOwned(EQUIPMENT_CHEST_ID)
      }
      busy={busy}
      unavailable={!available}
      onBuy={(_, quantity) => void buy(quantity, false)}
      hivePrice={prices.chestHivePrice()}
      hiveBusy={hiveShop.busy}
      onBuyWithHive={(_, quantity) => void buy(quantity, true)}
    />
  );
}
