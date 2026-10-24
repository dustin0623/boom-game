import type { InventoryItemRepository } from "@/lib/modules/items/server.types";
import { assertItemQuantity } from "@/features/types/game/inventory";
import { getFixtureState } from "./store";
export function createFixtureInventoryItemRepository(): InventoryItemRepository {
  return {
    async listByWallet(wallet) {
      return structuredClone(
        [...getFixtureState().stacks.values()].filter(
          (row) => row.wallet === wallet,
        ),
      );
    },
    async quantity(wallet, itemId) {
      return (
        getFixtureState().stacks.get(JSON.stringify([wallet, itemId]))
          ?.quantity ?? 0
      );
    },
    async grant(wallet, itemId, quantity) {
      assertItemQuantity(itemId, quantity);
      const key = JSON.stringify([wallet, itemId]),
        row = getFixtureState().stacks.get(key);
      if (row && row.quantity > Number.MAX_SAFE_INTEGER - quantity)
        throw new Error("Inventory quantity exceeds safe range");
      getFixtureState().stacks.set(key, {
        wallet,
        itemId,
        quantity: (row?.quantity ?? 0) + quantity,
        createdAt: row?.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
    },
    async consume(wallet, itemId) {
      const row = getFixtureState().stacks.get(
        JSON.stringify([wallet, itemId]),
      );
      if (!row || row.quantity < 1) return { ok: false };
      row.quantity--;
      return { ok: true };
    },
  };
}
