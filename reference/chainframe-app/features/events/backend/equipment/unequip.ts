import { settleTick } from "@/features/events/backend/tick-player/action";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";

export type UnequipItemResult = Awaited<
  ReturnType<(typeof equipmentRepository)["unequip"]>
>;

export async function unequipItem(
  wallet: string,
  itemId: string,
): Promise<UnequipItemResult> {
  await settleTick(wallet);
  const result = await equipmentRepository.unequip(itemId, wallet);
  if (result.ok && result.item) {
    const player = await playerRepository.findByWallet(wallet);
    if (player?.equipment[result.item.slot] === itemId)
      await playerRepository.setEquipment(wallet, result.item.slot, null);
  }
  return result;
}
