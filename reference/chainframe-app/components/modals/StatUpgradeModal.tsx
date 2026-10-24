import { useEffect, useState } from "react";

import { useGameActionFlow } from "@/hooks/useGameActionFlow";
import { StatActionButton } from "@/components/cards/StatUpgradeCard";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Root as Dialog,
  Trigger as DialogTrigger,
} from "@radix-ui/react-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  maxAffordableUpgrades,
  totalUpgradeCost,
} from "@/features/types/game/stats";
import { buildUpgradeStatAction } from "@/lib/utils/game/action-protocol";
import { formatHash, formatInt } from "@/lib/format";

import type { StatKey } from "@/features/types/game/types";

const PROTOCOL_STATS = {
  hashRate: "hashRate",
  hackPower: "hackPower",
  security: "security",
  luck: "luck",
} as const;

interface StatUpgradeModalProps {
  statKey: StatKey;
  label: string;
  currentLevel: number;
  gearBonus: number;
  wallet: number;
}

export function StatUpgradeModal({
  statKey,
  label,
  currentLevel,
  gearBonus,
  wallet,
}: StatUpgradeModalProps) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState(1);

  const { lifecycle, errorMessage, busy, unavailable, run, fail, reset } =
    useGameActionFlow({
      onSubmitted: () => {
        setOpen(false);
      },
    });

  const maxLevels = maxAffordableUpgrades(currentLevel, wallet);
  const clampedLevels = Math.min(levels, Math.max(1, maxLevels));
  const cost = totalUpgradeCost(currentLevel, clampedLevels);
  const nextLevel = currentLevel + clampedLevels;
  const canAfford = maxLevels > 0 && wallet >= cost;
  const awaitingOrProcessed =
    lifecycle === "broadcast" || lifecycle === "processed";

  useEffect(() => {
    if (!open) return;
    setLevels(1);
    reset();
  }, [open, reset]);

  const confirm = () => {
    if (!canAfford || busy) return;
    reset();
    void executeStat();
  };

  const executeStat = async () => {
    if (!canAfford || busy) return;
    const protocolStat = PROTOCOL_STATS[statKey as keyof typeof PROTOCOL_STATS];
    if (!protocolStat) {
      fail("This stat is not available through the wallet action protocol");
      return;
    }
    const levelsToBuy = clampedLevels;
    await run({
      build: (nonce) =>
        buildUpgradeStatAction({
          stat: protocolStat,
          levels: levelsToBuy,
          nonce,
        }),
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogTrigger asChild>
          <StatActionButton
            disabled={maxLevels === 0 || busy || awaitingOrProcessed}
          >
            Upgrade
          </StatActionButton>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade {label}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose how many levels to buy at once. Each upgrade costs the
            current level squared.
          </p>

          <div className="mt-2 space-y-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current level</span>
              <span className="font-mono font-semibold text-foreground">
                {formatInt(currentLevel)}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="upgrade-levels"
                  className="text-sm text-muted-foreground"
                >
                  Levels to buy
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="upgrade-levels"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(1, maxLevels)}
                    step={1}
                    value={clampedLevels}
                    onChange={(event) => setLevels(Number(event.target.value))}
                    className="w-20 text-right"
                    disabled={maxLevels === 0 || busy || awaitingOrProcessed}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={maxLevels === 0 || busy || awaitingOrProcessed}
                    onClick={() => setLevels(maxLevels)}
                  >
                    Max
                  </Button>
                </div>
              </div>
              <Slider
                value={[clampedLevels]}
                min={1}
                max={Math.max(1, maxLevels)}
                step={1}
                disabled={maxLevels === 0 || busy || awaitingOrProcessed}
                onValueChange={(value) => setLevels(value[0] ?? 1)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>{formatInt(maxLevels)}</span>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">New level</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatInt(nextLevel)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gear bonus</span>
                <span className="font-mono text-success">
                  +{formatHash(gearBonus, 4, false)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-2">
                <span className="text-muted-foreground">Total cost</span>
                <span className="font-mono font-semibold text-primary">
                  {formatHash(cost, 0)} HASH
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Wallet balance</span>
              <span className="font-mono text-foreground">
                {formatHash(wallet)} HASH
              </span>
            </div>
          </div>

          {errorMessage ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {lifecycle === "broadcasting" ? (
            <p role="status" className="text-xs text-muted-foreground">
              Waiting for Hive Keychain approval…
            </p>
          ) : null}
          <Button
            className="mt-2 w-full"
            variant="outline"
            disabled={!canAfford || busy || unavailable || awaitingOrProcessed}
            loading={busy}
            onClick={confirm}
          >
            {busy
              ? "Waiting for Keychain…"
              : lifecycle === "broadcast"
                ? "Awaiting processing"
                : lifecycle === "processed"
                  ? "Processed"
                  : `Confirm ${clampedLevels > 1 ? `${formatInt(clampedLevels)} levels` : "1 level"}`}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
