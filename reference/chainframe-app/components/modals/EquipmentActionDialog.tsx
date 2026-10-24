"use client";
import { useEffect } from "react";
import {
  RARITY_META,
  SLOT_META,
  STAT_KEYS,
  STAT_META,
} from "@/lib/config/constants/game";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useGameActionFlow } from "@/hooks/useGameActionFlow";
import {
  itemUpgradeCost,
  SALVAGE_MULTIPLIERS,
  salvageValue,
  upgradedStats,
  UPGRADE_MULTIPLIER,
} from "@/features/types/game/items";
import { buildEquipmentAction } from "@/lib/utils/game/action-protocol";
import { formatHash } from "@/lib/format";
import { slotIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/features/stores/playerStore";
import type { EquipmentActionKind } from "@/features/types/game/actions";
import type { Equipment } from "@/features/types/game/types";

export interface EquipmentActionRequest {
  kind: EquipmentActionKind;
  item: Equipment;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

function ItemSummary({ item }: { item: Equipment }) {
  const rarity = RARITY_META[item.rarity];
  const Icon = slotIcon(item.slot);
  return (
    <div className="flex gap-3 border-b border-border pb-4">
      <span
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-xl",
          rarity.bgClass,
          rarity.textClass,
        )}
      >
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {item.name}
          <span className={cn("text-[10px] uppercase", rarity.textClass)}>
            {rarity.label}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {SLOT_META[item.slot].label} · Level {item.level}
        </p>
      </div>
    </div>
  );
}

export function EquipmentActionDialog({
  request,
  onClose,
  actionsDisabled = false,
}: {
  request: EquipmentActionRequest | null;
  onClose: () => void;
  actionsDisabled?: boolean;
}) {
  const flow = useGameActionFlow({ onSubmitted: onClose });
  const { reset } = flow;
  useEffect(() => {
    if (request) reset();
  }, [request, reset]);
  const settled =
    flow.lifecycle === "broadcast" || flow.lifecycle === "processed";
  const sparks = usePlayerStore((state) => state.sparks);
  const item = request?.item;
  const upgradeCost =
    request?.kind === "upgrade" ? itemUpgradeCost(request.item) : 0;
  const nextStats =
    request?.kind === "upgrade" ? upgradedStats(request.item.stats) : null;

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !flow.busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {request?.kind === "upgrade"
              ? "Upgrade Item"
              : request?.kind === "salvage"
                ? "Salvage Item"
                : request
                  ? request.kind + " " + request.item.name
                  : "Update equipment"}
          </DialogTitle>
        </DialogHeader>
        {item &&
        (request?.kind === "upgrade" || request?.kind === "salvage") ? (
          <>
            <ItemSummary item={item} />
            {request.kind === "upgrade" && nextStats ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Upgrade this item for{" "}
                  <span className="font-semibold text-success">
                    ~{formatHash(upgradeCost, 3)} SPARKS
                  </span>
                  . The item stats will improve based on the following table.
                </p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="bg-secondary/40">
                        <td className="px-3 py-2 font-medium">Your SPARKS</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatHash(sparks, 3)}
                        </td>
                        <td className="w-8 px-1 py-2 text-center text-destructive">
                          →
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-destructive">
                          -{formatHash(upgradeCost, 3)}
                        </td>
                      </tr>
                      <tr className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">Level</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.level}
                        </td>
                        <td className="px-1 py-2 text-center text-success">
                          →
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-success">
                          {item.level + 1}
                        </td>
                      </tr>
                      {STAT_KEYS.filter(
                        (key) => (item.stats[key] ?? 0) > 0,
                      ).map((key) => (
                        <tr
                          key={key}
                          className="border-t border-border/60 bg-secondary/20"
                        >
                          <td className="px-3 py-2 font-medium">
                            {STAT_META[key].label}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {round3(item.stats[key] ?? 0)}
                          </td>
                          <td className="px-1 py-2 text-center text-success">
                            →
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-success">
                            {round3(nextStats[key] ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Every rolled stat gains{" "}
                  {Math.round((UPGRADE_MULTIPLIER - 1) * 100)}% per level.
                </p>
              </div>
            ) : null}
            {request.kind === "salvage" ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Salvage this item for{" "}
                  <span className="font-semibold text-success">
                    {formatHash(salvageValue(item), 3)} SPARKS
                  </span>
                  . The item is destroyed in the process.
                </p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/60 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Stat
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Value
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Multiplier
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          SPARKS
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {STAT_KEYS.map((key) => {
                        const value = item.stats[key] ?? 0;
                        const multiplier = SALVAGE_MULTIPLIERS[key];
                        return (
                          <tr key={key} className="border-t border-border/60">
                            <td className="px-3 py-1.5">
                              {STAT_META[key].label}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {round3(value)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                              x{multiplier}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-success">
                              {round3(value * multiplier)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        {flow.errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {flow.errorMessage}
          </p>
        ) : null}
        {flow.lifecycle === "broadcasting" ? (
          <p role="status" className="text-xs text-muted-foreground">
            Waiting for Hive Keychain approval…
          </p>
        ) : null}
        {actionsDisabled ? (
          <p role="status" className="text-sm text-muted-foreground">
            Inventory is unavailable. Refresh Inventory before confirming.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={flow.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !request ||
              actionsDisabled ||
              flow.busy ||
              flow.unavailable ||
              settled
            }
            loading={flow.busy}
            onClick={() => {
              if (request && !actionsDisabled)
                void flow.run({
                  build: (nonce) =>
                    buildEquipmentAction(request.kind, request.item, nonce),
                });
            }}
          >
            {flow.busy
              ? "Waiting for Keychain…"
              : settled
                ? "Awaiting processing"
                : "Confirm with Hive Keychain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
