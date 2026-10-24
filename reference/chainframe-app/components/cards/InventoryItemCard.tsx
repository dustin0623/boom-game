import type { ReactNode, Ref } from "react";
import { Bomb, PackageOpen, ShieldPlus } from "lucide-react";
import { CHESTS, EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import { CONSUMABLES } from "@/features/types/game/consumables";
import type { InventoryItemId } from "@/features/types/game/inventory";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function InventoryItemCard({
  itemId,
  quantity,
  children,
  cardRef,
}: {
  itemId: InventoryItemId;
  quantity: number;
  children?: ReactNode;
  cardRef?: Ref<HTMLElement>;
}) {
  const chest = itemId === EQUIPMENT_CHEST_ID;
  const definition = chest ? CHESTS[itemId] : CONSUMABLES[itemId];
  const Icon = chest ? PackageOpen : itemId === "help-kit" ? ShieldPlus : Bomb;
  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      className="card-soft flex min-w-0 flex-col gap-4 p-4 focus-visible:outline focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl",
            itemId === "help-kit"
              ? "bg-success/15 text-success"
              : "bg-primary/15 text-primary",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="break-words text-sm font-semibold">
            {"label" in definition ? definition.label : definition.name}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {chest
              ? "Open one owned chest. Luck applies when opening."
              : "description" in definition && definition.description}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Owned</span>
        <span className="font-mono text-xl font-semibold tabular-nums">
          {formatInt(quantity)}
        </span>
      </div>
      {children ? <div className="mt-auto space-y-2">{children}</div> : null}
    </article>
  );
}
