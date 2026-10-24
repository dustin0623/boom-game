"use client";

import { useState } from "react";
import { Bomb, ShieldPlus, Star, Swords } from "lucide-react";

import { HelpModal } from "@/components/modals/HelpModal";
import { SabotageModal } from "@/components/modals/SabotageModal";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { consumableQuantity } from "@/features/types/game/consumables";
import {
  consumableIdsOfKind,
  helpableStats,
  sabotageableStats,
  socialActionState,
} from "@/features/types/game/social-ui";
import type { Rival } from "@/features/types/game/types";
import { formatInt } from "@/lib/format";

interface PlayerModalProps {
  rival: Rival | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRaid: (rival: Rival) => void;
  /** Reason the Raid button is disabled; `null` when raiding is allowed. */
  raidBlockedReason: string | null;
  /** Revalidate the target list after a Sabotage or Help. */
  onSocialApplied: () => void | Promise<void>;
}

const totalOwned = (
  consumables: Partial<Record<string, number>>,
  kind: "sabotage" | "help",
) =>
  consumableIdsOfKind(kind).reduce(
    (sum, id) => sum + consumableQuantity(consumables, id),
    0,
  );

/**
 * Target summary with the three PvP actions. Target data is display-only: it
 * never feeds a price or a raid outcome, the server decides those.
 */
export function PlayerModal({
  rival,
  open,
  onOpenChange,
  onRaid,
  raidBlockedReason,
  onSocialApplied,
}: PlayerModalProps) {
  const consumables = useInventoryStore((state) => state.items);
  const [sabotageOpen, setSabotageOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const sabotageActive = rival?.sabotageActive === true;
  const activeEffects = rival?.activeEffects;
  const sabotageBlocked = activeEffects
    ? sabotageableStats(activeEffects).length === 0
    : sabotageActive;
  const helpAvailable = activeEffects
    ? helpableStats(activeEffects).length > 0
    : sabotageActive;
  const sabotageState = socialActionState({
    kind: "sabotage",
    sabotageActive: sabotageBlocked,
    ownedQuantity: totalOwned(consumables, "sabotage"),
  });
  const helpState = socialActionState({
    kind: "help",
    sabotageActive: helpAvailable,
    ownedQuantity: totalOwned(consumables, "help"),
    helpBlockedByOwnSabotage: rival?.helpBlockedByOwnSabotage,
  });
  const target = rival ? { id: rival.id, username: rival.username } : null;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSabotageOpen(false);
      setHelpOpen(false);
    }
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open && rival !== null} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          {rival ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                  @{rival.username}
                  <span className="inline-flex items-center gap-1 rounded-full bg-transparent px-2 py-1 text-xs font-semibold leading-none text-warning">
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    <span className="sr-only">Level</span>
                    {rival.level}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Choose how to deal with this player.
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="card-soft p-3">
                  <dt className="text-xs text-muted-foreground">Level</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatInt(rival.level)}
                  </dd>
                </div>
                <div className="card-soft p-3">
                  <dt className="text-xs text-muted-foreground">Hash Rate</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatInt(rival.hashRate)}
                  </dd>
                </div>
              </dl>

              <section
                aria-labelledby="player-modal-raid"
                className="space-y-2"
              >
                <h3 id="player-modal-raid" className="text-sm font-semibold">
                  Raid
                </h3>
                <Button
                  type="button"
                  className="w-full"
                  disabled={raidBlockedReason !== null}
                  onClick={() => {
                    onRaid(rival);
                    handleOpenChange(false);
                  }}
                >
                  <Swords className="size-4" aria-hidden="true" />
                  Raid @{rival.username}
                </Button>
                {raidBlockedReason ? (
                  <p className="text-xs text-muted-foreground">
                    {raidBlockedReason}
                  </p>
                ) : null}
              </section>

              <section
                aria-labelledby="player-modal-sabotage"
                className="space-y-2"
              >
                <h3
                  id="player-modal-sabotage"
                  className="text-sm font-semibold"
                >
                  Sabotage
                </h3>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={sabotageBlocked}
                  onClick={() => setSabotageOpen(true)}
                >
                  <Bomb className="size-4" aria-hidden="true" />
                  Sabotage @{rival.username}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {sabotageBlocked
                    ? sabotageState.message
                    : `You own ${totalOwned(consumables, "sabotage")} Sabotage item${totalOwned(consumables, "sabotage") === 1 ? "" : "s"}.`}
                </p>
              </section>

              <section
                aria-labelledby="player-modal-help"
                className="space-y-2"
              >
                <h3 id="player-modal-help" className="text-sm font-semibold">
                  Help
                </h3>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={!helpState.canUse}
                  onClick={() => {
                    if (helpState.canUse) setHelpOpen(true);
                  }}
                >
                  <ShieldPlus className="size-4" aria-hidden="true" />
                  Help @{rival.username}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {helpState.canUse
                    ? `This player is sabotaged. You own ${totalOwned(consumables, "help")} Help item${totalOwned(consumables, "help") === 1 ? "" : "s"}.`
                    : helpState.message}
                </p>
                {helpState.blockedBy === "eligibility_unknown" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onSocialApplied()}
                  >
                    Refresh targets
                  </Button>
                )}
              </section>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <SabotageModal
        target={target}
        open={sabotageOpen}
        onOpenChange={setSabotageOpen}
        sabotageActive={sabotageActive}
        activeEffects={activeEffects}
        onApplied={onSocialApplied}
      />
      <HelpModal
        target={target}
        open={helpOpen}
        onOpenChange={setHelpOpen}
        sabotageActive={sabotageActive}
        activeEffects={activeEffects}
        helpBlockedByOwnSabotage={rival?.helpBlockedByOwnSabotage}
        onApplied={onSocialApplied}
      />
    </>
  );
}
