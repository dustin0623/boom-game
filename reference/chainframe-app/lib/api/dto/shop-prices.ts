import {
  EQUIPMENT_CHEST_BASE_PRICE,
  EQUIPMENT_CHEST_ID,
  EQUIPMENT_CHEST_HIVE_PRICE,
} from "@/lib/config/constants/game";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import { getEmissionShopPrice, emissionExcess } from "@/lib/utils/game/pricing";
import {
  CONSUMABLE_HIVE_PRICE,
  CONSUMABLE_IDS,
  CONSUMABLES,
} from "@/features/types/game/consumables";
import type { ShopPricesDto } from "@/lib/api/types";
import type { IPlayer } from "@/lib/modules/players/server.types";
import type { ItemQuantities } from "@/features/types/game/inventory";

export function toShopPricesDto(
  globalMinerate: number,
  emission: { yesterday: number; highWater: number },
  player: IPlayer | null,
  asOf: number,
  items: ItemQuantities = {},
): ShopPricesDto {
  const base = {
    asOf,
    globalMinerate,
    chests: {
      [EQUIPMENT_CHEST_ID]: getEmissionShopPrice({
        basePrice: EQUIPMENT_CHEST_BASE_PRICE,
        emission: emission.highWater,
      }),
    } as ShopPricesDto["chests"],
    chestHivePrice: EQUIPMENT_CHEST_HIVE_PRICE,
    chestOwned: { [EQUIPMENT_CHEST_ID]: items[EQUIPMENT_CHEST_ID] ?? 0 },
    emission: {
      yesterday: emission.yesterday,
      pricedAt: emission.highWater,
      threshold: SOCIAL_ECONOMY.pricing.emissionThresholdPerDay,
      excess: emissionExcess(emission.highWater),
    },
  };

  if (!player) return base;

  const playerMinerate = player.stats.hashRate;
  const consumables = {} as NonNullable<ShopPricesDto["consumables"]>;
  for (const id of CONSUMABLE_IDS) {
    consumables[id] = {
      price: getEmissionShopPrice({
        basePrice: CONSUMABLES[id].basePrice,
        emission: emission.highWater,
      }),
      hivePrice: CONSUMABLE_HIVE_PRICE,
      owned: items[id] ?? 0,
    };
  }
  return { ...base, playerMinerate, consumables };
}
