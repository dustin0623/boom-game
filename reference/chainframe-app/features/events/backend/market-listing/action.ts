import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { hiveAmountSchema } from "@/lib/utils/game/pricing";

export async function changeMarketListing(
  wallet: string,
  itemId: string,
  price?: number,
  currency?: "HIVE",
) {
  if (
    price !== undefined &&
    (currency !== "HIVE" || !hiveAmountSchema.safeParse(price).success)
  )
    return {
      ok: false,
      error: "Marketplace listings require a valid HIVE price",
    };
  const item = await equipmentRepository.findById(itemId);
  const result =
    price === undefined
      ? await equipmentRepository.cancelListing(itemId, wallet)
      : await equipmentRepository.listForSale(itemId, wallet, price);
  if (!result.ok) return result;
  await logRepository.create({
    type: "market_item",
    wallet,
    data: {
      action: price === undefined ? "cancelled" : "listed",
      refId: itemId,
      price,
      currency: price === undefined ? item?.market?.currency : "HIVE",
      name: item?.name,
      rarity: item?.rarity,
      slot: item?.slot,
    },
  });
  return result;
}
