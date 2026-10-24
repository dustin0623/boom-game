import { toEpoch } from "@/lib/api/dto";
import type { IEquipmentDocument } from "@/lib/modules/equipments/server.types";

export function toEquipmentDto(item: IEquipmentDocument) {
  return {
    id: String(item._id),
    templateId: item.templateId,
    owner: item.owner,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    level: item.level,
    stats: item.stats,
    equipped: item.equipped,
    salvaged: item.salvaged,
    market:
      item.market?.currency === "HIVE"
        ? {
            price: item.market.price,
            currency: item.market.currency,
            listedAt: item.market.listedAt,
            isMarket: item.market.isMarket,
          }
        : null,
    createdAt: toEpoch(item.createdAt),
    lastTransfer: item.lastTransfer,
  };
}

export function toMarketplaceListing(item: IEquipmentDocument) {
  return {
    kind: "item" as const,
    refId: String(item._id),
    templateId: item.templateId,
    owner: item.owner ?? "",
    price: item.market!.price,
    currency: "HIVE" as const,
    listedAt: item.market!.listedAt,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    level: item.level,
    stats: item.stats,
  };
}
