import { STAT_KEYS } from "@/lib/config/constants/game";
import type { EquipmentDto } from "@/lib/api/types";
import type {
  Equipment,
  Rarity,
  SlotKey,
  StatRoll,
} from "@/features/types/game/types";

/**
 * Maps an equipment DTO from /api/items into the client's Equipment shape,
 * for rendering and the inventory cache. The server is always the
 * source of truth here — this is a pure display-layer conversion, never a
 * substitute for minting.
 */
export function equipmentDtoToEquipment(
  item: EquipmentDto | Record<string, unknown>,
): Equipment {
  const dto = item as EquipmentDto;
  const rawStats = (dto.stats ?? {}) as Record<string, number>;

  // Server rolls store all six stat keys with 0 for unset ones; local
  // Equipment.stats is a sparse StatRoll (only the rolled keys present).
  const stats: StatRoll = {};
  for (const key of STAT_KEYS) {
    const value = rawStats[key];
    if (value) stats[key] = value;
  }

  return {
    id: dto.id,
    name: dto.name,
    slot: dto.slot as SlotKey,
    rarity: dto.rarity as Rarity,
    stats,
    level: dto.level,
    equipped: dto.equipped,
    createdAt: dto.createdAt,
  };
}
