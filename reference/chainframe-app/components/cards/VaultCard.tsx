import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownToLine, Vault } from "lucide-react";

import { AnimatedNumber } from "@/components/game/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  formatMiningRate,
  formatCountdown,
  formatHash,
  formatDuration,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";

interface VaultCardProps {
  vault: number;
  capacity: number;
  fillPercent: number;
  perSecond: number;
  secondsToFull: number | null;
  onClaim: () => void;
  claiming?: boolean;
  unavailable?: boolean;
  charges: number;
  maxCharges: number;
  /** Milliseconds until the next claim charge, null when charges are full. */
  msUntilNextCharge?: number | null;
  /** Current mining decay multiplier (1 = no decay). */
  decay?: number;
  /** Milliseconds until the next decay step, null when floored/no data. */
  msUntilNextDecay?: number | null;
}

export function VaultCard({
  vault,
  capacity,
  fillPercent,
  perSecond,
  secondsToFull,
  onClaim,
  claiming,
  unavailable,
  charges,
  maxCharges,
  msUntilNextCharge = null,
  decay = 1,
  msUntilNextDecay = null,
}: VaultCardProps) {
  const full = fillPercent >= 100;
  const decayed = decay < 0.999;

  return (
    <div className="card-soft relative overflow-hidden p-6">
      <div
        aria-hidden
        className="absolute -right-16 -top-16 size-52 rounded-full bg-primary/10 blur-2xl"
      />
      <div className="relative space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Vault className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Vault</p>
              <p className="text-xs text-muted-foreground">
                Unclaimed HASH can be stolen in a raid.
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              full ? "bg-danger/15 text-danger" : "bg-success/15 text-success",
            )}
          >
            {full ? "Full" : "Mining"}
          </span>
        </div>

        <motion.div
          animate={claiming ? { scale: [1, 1.06, 1] } : {}}
          transition={{ duration: 0.4 }}
        >
          <p className="text-4xl font-semibold tabular-nums text-gradient-brand sm:text-5xl">
            <AnimatedNumber
              value={vault}
              format={(value) => formatHash(value, 4, false)}
            />
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <span>of {formatHash(capacity, 4, false)} capacity</span>
            <span className="text-foreground">·</span>
            <span>
              {full
                ? "mining halted"
                : `Full in ${formatDuration(secondsToFull)}`}
            </span>
          </p>
        </motion.div>

        <Progress value={fillPercent} className="h-2" />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatMiningRate(perSecond)} HASH / sec
          </span>
          <span className="tabular-nums font-medium">
            {formatHash(fillPercent, 4, false)}%
          </span>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={onClaim}
          disabled={vault <= 0 || charges <= 0 || claiming || unavailable}
        >
          <ArrowDownToLine className="size-4" />
          {charges <= 0
            ? "No claim charges"
            : `Claim ${formatHash(vault, 4, false)} HASH`}
        </Button>
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          {charges} / {maxCharges} claim charges &middot;{" "}
          {msUntilNextCharge === null
            ? "charges full"
            : `next in ${formatCountdown(msUntilNextCharge)}`}
        </p>

        {decayed ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-danger">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              Rate reduced to {formatPercent(decay * 100)} — upgrade or buy a
              chest to reset decay
              {msUntilNextDecay !== null
                ? ` (next drop in ${formatCountdown(msUntilNextDecay)})`
                : ""}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
