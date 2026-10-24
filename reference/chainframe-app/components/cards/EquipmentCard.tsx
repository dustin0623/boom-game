import { formatHash } from "@/lib/format";
import { motion } from "framer-motion";
import { Flame, Hammer, MoreHorizontal, Star, Tag } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Root as DropdownMenu,
  Trigger as DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
  RARITY_META,
  SLOT_META,
  STAT_KEYS,
  STAT_META,
} from "@/lib/config/constants/game";
import { equipmentScore } from "@/features/types/game/stats";
import { rarityStyles, slotIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Equipment } from "@/features/types/game/types";

interface EquipmentCardProps {
  variant?: "inventory" | "marketplace";
  item: Equipment;
  onEquip?: ((item: Equipment) => void) | undefined;
  onUnequip?: ((item: Equipment) => void) | undefined;
  onUpgrade?: ((item: Equipment) => void) | undefined;
  onSalvage?: ((item: Equipment) => void) | undefined;
  onSell?: ((item: Equipment) => void) | undefined;
  compact?: boolean | undefined;
  /** Hides every action (used for the chest reveal). */
  hideActions?: boolean | undefined;
  actionsDisabled?: boolean;
  /** Replaces the default equip/sell actions (used by the marketplace). */
  footer?: ReactNode;
}

export function EquipmentCard({
  variant = "inventory",
  item,
  onEquip,
  onUnequip,
  onUpgrade,
  onSalvage,
  onSell,
  compact,
  hideActions,
  actionsDisabled = false,
  footer,
}: EquipmentCardProps) {
  const rarity = rarityStyles(item.rarity);
  const SlotIcon = slotIcon(item.slot);
  const score = equipmentScore(item);
  const rolled = STAT_KEYS.filter((key) => (item.stats[key] ?? 0) > 0);
  const [busy, setBusy] = useState(false);
  const inventoryLayout = variant === "inventory" && !hideActions;

  // Equip/unequip hit the server, so keep a spinner up until the call
  // resolves — the handlers may return a promise or nothing.
  const runEquipAction = async (action?: (item: Equipment) => void) => {
    if (!action || busy || actionsDisabled) return;
    setBusy(true);
    try {
      await Promise.resolve(action(item));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={cn(
        "card-soft flex min-w-0 flex-col gap-3 p-4 ring-1 ring-inset",
        rarity.ringClass,
        item.equipped && "outline outline-1 outline-primary/60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            rarity.bgClass,
            rarity.textClass,
          )}
        >
          <SlotIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "flex gap-1.5",
              variant === "marketplace"
                ? "items-start"
                : inventoryLayout
                  ? "flex-wrap items-start"
                  : "items-center",
            )}
          >
            <h3
              className={cn(
                "text-sm font-semibold",
                variant === "marketplace"
                  ? "min-w-0 break-words"
                  : inventoryLayout
                    ? "min-w-0 break-words [overflow-wrap:anywhere]"
                    : "truncate",
              )}
            >
              {item.name}
            </h3>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning"
              title={`Level ${item.level}`}
            >
              <Star className="size-3 fill-current" />
              {item.level}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {SLOT_META[item.slot].label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("border-current/30 text-[10px]", rarity.textClass)}
            >
              {RARITY_META[item.rarity].label}
            </Badge>

            {item.equipped ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-[10px] text-primary"
              >
                Equipped
              </Badge>
            ) : null}
          </div>
        </div>
        <div
          className="shrink-0 text-right"
          title="Power score = SPARKS value if salvaged"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Power
          </p>
          <p className="text-lg font-semibold tabular-nums text-primary">
            {formatHash(score)}
          </p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
            sparks
          </p>
        </div>
      </div>

      {!compact ? (
        <ul className="grid grid-cols-2 gap-1.5 text-xs">
          {rolled.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-2 py-1"
            >
              <span className="truncate text-muted-foreground">
                {STAT_META[key].label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-success">
                +{formatHash(item.stats[key] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hideActions
        ? null
        : (footer ?? (
            <div className="mt-auto flex gap-2">
              {item.equipped ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={cn("flex-1", inventoryLayout && "min-h-11")}
                  loading={busy}
                  disabled={actionsDisabled}
                  onClick={() => void runEquipAction(onUnequip)}
                >
                  {busy ? "Unequipping…" : "Unequip"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className={cn("flex-1", inventoryLayout && "min-h-11")}
                  loading={busy}
                  disabled={actionsDisabled}
                  onClick={() => void runEquipAction(onEquip)}
                >
                  {busy ? "Equipping…" : "Equip"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className={
                      inventoryLayout ? "min-h-11 min-w-11" : undefined
                    }
                    disabled={actionsDisabled}
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={() => onSell?.(item)}
                    disabled={actionsDisabled || !onSell || item.equipped}
                    className={inventoryLayout ? "min-h-11" : undefined}
                    title={item.equipped ? "Unequip before selling" : undefined}
                  >
                    <Tag className="size-4" /> Sell
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onUpgrade?.(item)}
                    disabled={actionsDisabled || !onUpgrade}
                    className={inventoryLayout ? "min-h-11" : undefined}
                  >
                    <Hammer className="size-4" /> Upgrade
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onSalvage?.(item)}
                    disabled={actionsDisabled || !onSalvage || item.equipped}
                    title={
                      item.equipped ? "Unequip before salvaging" : undefined
                    }
                    className={cn(
                      "text-destructive focus:text-destructive",
                      inventoryLayout && "min-h-11",
                    )}
                  >
                    <Flame className="size-4" /> Salvage
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
    </motion.article>
  );
}
