import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { RARITY_META, SLOT_META, STAT_META } from "@/lib/config/constants/game";
import type { Rarity, SlotKey, StatKey } from "@/features/types/game/types";

const registry = Icons as unknown as Record<string, LucideIcon>;

export const iconByName = (name: string): LucideIcon =>
  registry[name] ?? Icons.Box;

export const statIcon = (key: StatKey): LucideIcon =>
  iconByName(STAT_META[key].icon);

export const slotIcon = (slot: SlotKey): LucideIcon =>
  iconByName(SLOT_META[slot].icon);

export const rarityStyles = (rarity: Rarity) => RARITY_META[rarity];
