import { create } from "zustand";
import { useAuthStore } from "@/features/stores/authStore";
import * as api from "@/lib/api/client";
import { SLOT_KEYS } from "@/lib/config/constants/game";
import { equipmentDtoToEquipment } from "@/features/types/game/equipment-mapper";
import type { Equipment, SlotKey } from "@/features/types/game/types";
import {
  isInventoryItemId,
  type ItemQuantities,
} from "@/features/types/game/inventory";
type EquippedMap = Record<SlotKey, string | null>;
const emptyEquipped = (): EquippedMap =>
  SLOT_KEYS.reduce(
    (acc, slot) => ({ ...acc, [slot]: null }),
    {} as EquippedMap,
  );
interface InventoryState {
  inventory: Equipment[];
  items: ItemQuantities;
  equipped: EquippedMap;
  loaded: boolean;
  error: string | null;
  syncFromApi: () => Promise<boolean>;
  reset: () => void;
}
export const useInventoryStore = create<InventoryState>()((set) => ({
  inventory: [],
  items: {},
  equipped: emptyEquipped(),
  loaded: false,
  error: null,
  syncFromApi: async () => {
    if (
      useAuthStore.getState().mode !== "wallet" ||
      !useAuthStore.getState().apiConnected
    )
      return false;
    const identity = useAuthStore.getState().address;
    const connectedAt = useAuthStore.getState().connectedAt;
    const mode = useAuthStore.getState().mode;
    const result = await api.getInventory();
    if (
      useAuthStore.getState().address !== identity ||
      useAuthStore.getState().connectedAt !== connectedAt ||
      useAuthStore.getState().mode !== mode ||
      !useAuthStore.getState().apiConnected
    )
      return false;
    if (
      !result.ok ||
      !result.equipments ||
      !result.items ||
      result.items.some(
        (row) =>
          !isInventoryItemId(row.itemId) ||
          !Number.isSafeInteger(row.quantity) ||
          row.quantity < 0,
      )
    ) {
      set({ error: result.error ?? "Inventory unavailable" });
      return false;
    }

    // Actively-listed items are pending a sale — keep them off the
    // equippable/sellable gear grid until the listing is cancelled or sold.
    const owned = result.equipments.filter((dto) => !dto.market?.isMarket);
    const inventory = owned.map(equipmentDtoToEquipment);
    const equipped = emptyEquipped();
    for (const item of inventory) {
      if (item.equipped) equipped[item.slot] = item.id;
    }
    const items: ItemQuantities = {};
    for (const row of result.items) items[row.itemId] = row.quantity;
    set({ inventory, items, equipped, loaded: true, error: null });
    return true;
  },

  reset: () =>
    set({
      inventory: [],
      items: {},
      equipped: emptyEquipped(),
      loaded: false,
      error: null,
    }),
}));
export const pickEquippedItems = (
  inventory: Equipment[],
  equipped: Record<SlotKey, string | null>,
): Equipment[] =>
  SLOT_KEYS.map((slot) => {
    const id = equipped[slot];
    return id ? inventory.find((item) => item.id === id) : undefined;
  }).filter((item): item is Equipment => Boolean(item));
