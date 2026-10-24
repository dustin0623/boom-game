"use client";

import { useGameStats } from "@/hooks/useGameStats";

import Link from "next/link";
import { useState } from "react";
import { Bomb, Loader2, ShieldPlus } from "lucide-react";

import { useGameActionFlow } from "@/hooks/useGameActionFlow";
import {
  buildHelpAction,
  buildSabotageAction,
} from "@/lib/utils/game/action-protocol";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { formatPercent } from "@/lib/format";

import {
  CONSUMABLES,
  consumableQuantity,
  type ConsumableId,
  type ConsumableKind,
  STAT_EFFECT_TARGETS,
  type StatEffectTarget,
} from "@/features/types/game/consumables";
import {
  STAT_EFFECT_LABELS,
  socialActionSuccessChance,
  isStatEffectTarget,
} from "@/features/types/game/stat-effects";

import {
  consumableIdsOfKind,
  helpableStats,
  sabotageableStats,
  socialActionState,
  type ActiveEffects,
} from "@/features/types/game/social-ui";
import { cn } from "@/lib/utils";

export interface SocialActionTarget {
  id: string;
  username: string;
}

export interface SocialActionModalProps {
  target: SocialActionTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Public flag from the raid targets response; gating only, the server re-validates. */
  sabotageActive: boolean;
  /** Public per-stat Sabotage strength; decides which stats can be sabotaged or helped. */
  activeEffects?: ActiveEffects;
  /** Viewer-specific eligibility; missing evidence disables Help. */
  helpBlockedByOwnSabotage?: boolean | undefined;
  /** Called after the server accepted the action, so the caller can revalidate its data. */
  onApplied?: () => void | Promise<void>;
}

const KIND_COPY: Record<
  ConsumableKind,
  {
    title: string;
    verb: string;
    busy: string;
    icon: typeof Bomb;
    accent: string;
  }
> = {
  sabotage: {
    title: "Sabotage",
    verb: "Use Sabotage",
    busy: "Sabotaging",
    icon: Bomb,
    accent: "text-destructive bg-destructive/15",
  },
  help: {
    title: "Help",
    verb: "Use Help",
    busy: "Helping",
    icon: ShieldPlus,
    accent: "text-success bg-success/15",
  },
};

/**
 * Shared dialog for spending an owned Sabotage or Help consumable on a player.
 * Built on the existing Dialog primitive, which provides the focus trap,
 * Escape handling and labelled title/description.
 */
export function SocialActionModal({
  kind,
  target,
  open,
  onOpenChange,
  sabotageActive,
  activeEffects,
  helpBlockedByOwnSabotage,
  onApplied,
}: SocialActionModalProps & { kind: ConsumableKind }) {
  const { total } = useGameStats();
  const consumables = useInventoryStore((state) => state.items);
  const [choice, setChoice] = useState<ConsumableId | null>(null);
  const [chosenStat, setStat] = useState<StatEffectTarget>(
    STAT_EFFECT_TARGETS[0],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flow = useGameActionFlow({
    onProcessed: () => {
      void onApplied?.();
    },
    onSubmitted: () => {
      onOpenChange(false);
    },
  });

  const awaiting =
    flow.lifecycle === "broadcast" || flow.lifecycle === "processed";
  const copy = KIND_COPY[kind];
  const Icon = copy.icon;
  const ids = consumableIdsOfKind(kind);
  const firstOwned =
    ids.find((id) => consumableQuantity(consumables, id) > 0) ?? null;
  const selectedId =
    choice && consumableQuantity(consumables, choice) > 0
      ? choice
      : (firstOwned ?? ids[0] ?? null);
  const ownedQuantity = selectedId
    ? consumableQuantity(consumables, selectedId)
    : 0;
  const eligibleStats: readonly StatEffectTarget[] = activeEffects
    ? kind === "sabotage"
      ? sabotageableStats(activeEffects)
      : helpableStats(activeEffects)
    : kind === "sabotage"
      ? sabotageActive
        ? []
        : STAT_EFFECT_TARGETS
      : sabotageActive
        ? STAT_EFFECT_TARGETS
        : [];
  const stat = eligibleStats.includes(chosenStat)
    ? chosenStat
    : (eligibleStats[0] ?? chosenStat);
  const state = socialActionState({
    kind,
    sabotageActive:
      kind === "sabotage"
        ? eligibleStats.length === 0
        : eligibleStats.length > 0,
    ownedQuantity,
    helpBlockedByOwnSabotage,
  });
  const ownsAny = firstOwned !== null;

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const handleUse = async () => {
    if (!target || !selectedId || !state.canUse || pending || awaiting) return;
    setError(null);
    flow.reset();
    await executeAction();
  };

  const executeAction = async () => {
    if (!target || !selectedId || !state.canUse || pending) return;
    setPending(true);
    setError(null);
    try {
      await flow.run({
        build: (nonce) =>
          kind === "sabotage"
            ? buildSabotageAction({
                target: target.username,
                consumableId: selectedId,
                stat,
                nonce,
              })
            : buildHelpAction({
                target: target.username,
                consumableId: selectedId,
                stat,
                nonce,
              }),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-lg",
                  copy.accent,
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {copy.title} {target ? `@${target.username}` : ""}
            </DialogTitle>
            <DialogDescription>
              {kind === "sabotage"
                ? "Spend one item to weaken one of this player's stats until they claim or are raided."
                : "Spend one item to counter a Sabotage on one of this player's stats."}
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Success chance: {formatPercent(socialActionSuccessChance(total.luck), 4)}. 25% base success chance + your Luck, capped at 100%. Each valid attempt consumes one item, even if it fails. A successful effect rolls 10–50% strength.
          </p>

          <RadioGroup
            value={eligibleStats.includes(stat) ? stat : ""}
            onValueChange={(value) => {
              if (isStatEffectTarget(value)) setStat(value);
            }}
            aria-label={
              kind === "sabotage" ? "Stat to sabotage" : "Stat to help"
            }
            className="grid grid-cols-3 gap-2"
          >
            {STAT_EFFECT_TARGETS.map((option) => {
              const inputId = `${kind}-stat-${option}`;
              const eligible = eligibleStats.includes(option);
              const strength = activeEffects?.[option] ?? 0;
              return (
                <Label
                  key={option}
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-border p-2 text-center text-xs font-semibold transition-colors",
                    eligible &&
                      stat === option &&
                      "border-primary bg-primary/5",
                    !eligible && "cursor-not-allowed opacity-50",
                  )}
                >
                  <RadioGroupItem
                    value={option}
                    id={inputId}
                    disabled={!eligible || pending}
                    className="sr-only"
                  />
                  {STAT_EFFECT_LABELS[option]}
                  {strength > 0 ? (
                    <span className="font-mono text-[10px] font-normal text-destructive">
                      {`-${formatPercent(strength * 100)}`}
                    </span>
                  ) : null}
                </Label>
              );
            })}
          </RadioGroup>

          <RadioGroup
            value={selectedId ?? ""}
            onValueChange={(value) => setChoice(value as ConsumableId)}
            aria-label={`${copy.title} item`}
            className="gap-2"
          >
            {ids.map((id) => {
              const quantity = consumableQuantity(consumables, id);
              const inputId = `${kind}-item-${id}`;
              return (
                <Label
                  key={id}
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors",
                    selectedId === id && "border-primary bg-primary/5",
                    quantity < 1 && "cursor-not-allowed opacity-60",
                  )}
                >
                  <RadioGroupItem
                    value={id}
                    id={inputId}
                    disabled={quantity < 1 || pending}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {CONSUMABLES[id].name}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {CONSUMABLES[id].description}
                    </span>
                  </span>
                  <span
                    className="font-mono text-sm font-bold tabular-nums"
                    aria-label={`${quantity} owned`}
                  >
                    ×{quantity}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>

          {state.message ? (
            <p
              role="status"
              className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground"
            >
              {state.message}{" "}
              {!ownsAny && state.blockedBy === "no_item" ? (
                <Link
                  href="/shop"
                  className="font-medium text-primary hover:underline"
                >
                  Visit the Shop
                </Link>
              ) : null}
            </p>
          ) : null}

          {state.blockedBy === "eligibility_unknown" && onApplied && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onApplied()}
            >
              Refresh targets
            </Button>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
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
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUse}
              disabled={
                !state.canUse || pending || flow.unavailable || awaiting
              }
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {pending ? copy.busy : copy.verb}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
