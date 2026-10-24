import { settleTick } from "@/features/events/backend/tick-player/action";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";

export type EquipItemResult = Awaited<
  ReturnType<(typeof equipmentRepository)["equip"]>
>;

export async function equipItem(
  wallet: string,
  itemId: string,
): Promise<EquipItemResult> {
  await settleTick(wallet);
  const result = await equipmentRepository.equip(itemId, wallet);
  if (result.ok && result.item) {
    // Point the player's equipment slot at the newly equipped item. The repository already
    // unequipped any prior item in the same slot, so overwriting the slot ref keeps the
    // player document authoritative.
    await playerRepository.setEquipment(
      wallet,
      result.item.slot,
      result.item.id,
    );
  }
  return result;
}
