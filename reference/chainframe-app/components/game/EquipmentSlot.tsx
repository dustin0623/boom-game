import { motion } from "framer-motion";
import { Plus, Star } from "lucide-react";

import { SLOT_META, STAT_KEYS, STAT_META } from "@/lib/config/constants/game";
import { equipmentScore } from "@/features/types/game/stats";
import { formatHash } from "@/lib/format";
import { rarityStyles, slotIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Equipment, SlotKey } from "@/features/types/game/types";

interface EquipmentSlotProps {
  slot: SlotKey;
  item?: Equipment | undefined;
  onSelect?: ((slot: SlotKey) => void) | undefined;
}

export function EquipmentSlot({ slot, item, onSelect }: EquipmentSlotProps) {
  const SlotIcon = slotIcon(slot);
  const rarity = item ? rarityStyles(item.rarity) : null;

  return (
    <motion.div
      layout
      whileHover={{ y: -3 }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(slot) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(slot);
              }
            }
          : undefined
      }
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={cn(
        "card-soft relative flex flex-col gap-2 p-4",
        item ? cn("ring-1 ring-inset", rarity?.ringClass) : "border-dashed",
        onSelect && "cursor-pointer",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl",
            item
              ? cn(rarity?.bgClass, rarity?.textClass)
              : "bg-muted text-muted-foreground",
          )}
        >
          <SlotIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {SLOT_META[slot].label}
          </p>
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                !item && "text-muted-foreground",
              )}
            >
              {item ? item.name : "Empty slot"}
            </p>
            {item && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning"
                title={`Level ${item.level}`}
              >
                <Star className="size-3 fill-current" />
                {item.level}
              </span>
            )}
          </div>
        </div>
        {!item && <Plus className="size-4 shrink-0 text-muted-foreground" />}
      </div>

      {item ? (
        <>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {STAT_KEYS.filter((key) => (item.stats[key] ?? 0) > 0).map(
              (key) => (
                <span
                  key={key}
                  className="rounded-md bg-secondary/60 px-1.5 py-0.5"
                >
                  {STAT_META[key].label}{" "}
                  <span className="font-semibold text-success">
                    +{formatHash(item.stats[key] ?? 0)}
                  </span>
                </span>
              ),
            )}
          </div>
          <p
            className="text-xs text-muted-foreground"
            title="Power score = SPARKS value if salvaged"
          >
            Power score{" "}
            <span className="font-semibold text-primary">
              {formatHash(equipmentScore(item))} SPARKS
            </span>
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Equip gear from your inventory.
        </p>
      )}
    </motion.div>
  );
}
