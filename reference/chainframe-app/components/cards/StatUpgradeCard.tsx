import { formatHash } from "@/lib/format";
import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Root as Dialog,
  Trigger as DialogTrigger,
} from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/** Mythoria-style projection table: next N levels with their upgrade cost. */
export function UpgradeTableModal({
  title,
  currentLevel,
  rowCount = 40,
  computeCost,
  formatValue,
}: {
  title: string;
  currentLevel: number;
  rowCount?: number;
  computeCost: (level: number) => number;
  formatValue: (level: number) => string;
}) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    level: currentLevel + i,
    cost: i === 0 ? undefined : computeCost(currentLevel + i - 1),
    isCurrent: i === 0,
  }));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${title}`}
          className="text-muted-foreground/70 transition-colors hover:text-primary"
        >
          <Info className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold tracking-wide">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.level}
              className={cn(
                "flex items-center justify-between px-6 py-2.5 text-sm",
                row.isCurrent && "bg-secondary/50",
              )}
            >
              <span className="font-mono text-muted-foreground">
                Lv {row.level.toLocaleString()}
                {row.isCurrent ? (
                  <span className="text-muted-foreground/60"> (current)</span>
                ) : (
                  row.cost !== undefined && (
                    <span className="text-muted-foreground/60">
                      {" "}
                      (cost: {Math.round(row.cost).toLocaleString()})
                    </span>
                  )
                )}
              </span>
              <span className="font-mono font-semibold text-primary">
                {formatValue(row.level)}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface StatUpgradeCardProps {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  meta?: ReactNode;
  action?: ReactNode;
}

/** Bracket-framed stat tile: title, large value, meta line and an inline action. */
export function StatUpgradeCard({
  title,
  value,
  unit,
  icon: Icon,
  meta,
  action,
}: StatUpgradeCardProps) {
  return (
    <div className="card-soft flex min-h-[160px] flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 truncate text-3xl font-bold tabular-nums">
            {value}
            {unit ? (
              <span className="ml-2 text-sm font-semibold tracking-widest text-primary">
                {unit}
              </span>
            ) : null}
          </p>
          {meta ? (
            <div className="mt-2 text-xs text-muted-foreground">{meta}</div>
          ) : null}
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <Icon className="size-5" />
        </span>
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Outlined action button matching the reference layout. */
export function StatActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-primary px-4 py-1.5 text-xs font-semibold tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-primary"
    >
      {children}
    </button>
  );
}

/**
 * Threshold table modal: shows how much staked/burned HASH is needed for
 * each percentage tier of a derived stat.
 */
export function StatTableModal({
  title,
  unitLabel,
  rows,
  current,
}: {
  title: string;
  unitLabel: string;
  rows: [number, number][];
  current: number;
}) {
  const reached = rows.filter(([threshold]) => current >= threshold).length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${title}`}
          className="text-muted-foreground/70 transition-colors hover:text-primary"
        >
          <Info className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold tracking-wide">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>{unitLabel}</span>
          <span>Bonus</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {rows.map(([threshold, bonus], index) => (
            <div
              key={threshold}
              className={cn(
                "flex items-center justify-between px-6 py-2.5 text-sm",
                index === reached - 1 && "bg-secondary/50",
              )}
            >
              <span className="font-mono text-muted-foreground">
                {threshold.toLocaleString()}
                {index === reached - 1 && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-primary">
                    current
                  </span>
                )}
              </span>
              <span className="font-mono font-semibold text-primary">
                +{formatHash(bonus, 4, false)}%
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
