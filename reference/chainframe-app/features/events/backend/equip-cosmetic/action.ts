import { playerRepository } from "@/lib/modules/players/server.repository";

import {
  getTemplate,
  isCosmeticUnlocked,
  type CosmeticKind,
} from "@/features/types/game/templates";
export async function equipCosmetic(
  wallet: string,
  kind: CosmeticKind,
  templateId: number,
) {
  const player = await playerRepository.findByWallet(wallet);
  if (getTemplate(templateId)?.kind !== kind)
    return { ok: false, error: "Unknown cosmetic template" };
  if (!player || !isCosmeticUnlocked(player.level, templateId))
    return { ok: false, error: "Cosmetic not unlocked yet" };
  await playerRepository.setCosmetic(wallet, kind, templateId);
  return { ok: true, kind, templateId };
}
