import { EQUIPMENT_CHEST_BASE_PRICE } from "@/lib/config/constants/game";
import { getEmissionShopPrice } from "@/lib/utils/game/pricing";
import {
  CONSUMABLES,
  type ConsumableId,
} from "@/features/types/game/consumables";

import { getPricingEmission } from "./emission.server";

/** Live HASH price of the Equipment Chest. Takes no player input by design. */
export async function getLiveEquipmentChestPrice(): Promise<number> {
  const { highWater } = await getPricingEmission();
  return getEmissionShopPrice({
    basePrice: EQUIPMENT_CHEST_BASE_PRICE,
    emission: highWater,
  });
}

export interface ConsumableQuote {
  unitPrice: number;
  pricedEmission: number;
}

/**
 * Unit price of one consumable from the shared completed-day emission tier.
 */
export async function getLiveConsumablePrice(
  itemId: ConsumableId,
): Promise<ConsumableQuote> {
  const { highWater } = await getPricingEmission();
  const unitPrice = getEmissionShopPrice({
    basePrice: CONSUMABLES[itemId].basePrice,
    emission: highWater,
  });
  return { unitPrice, pricedEmission: highWater };
}
