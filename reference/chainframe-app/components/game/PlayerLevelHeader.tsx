import { Info, Star } from "lucide-react";
import { useState } from "react";

import { Progress } from "@/components/ui/progress";
import { TooltipContent } from "@/components/ui/tooltip";
import {
  Root as Tooltip,
  Provider as TooltipProvider,
  Trigger as TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { levelProgress } from "@/features/types/game/level";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getAvatarByTemplateId,
  DEFAULT_AVATAR_TEMPLATE_ID,
} from "@/features/types/game/templates";

/** Compact "<star> 4" chip used next to a username. */
export function LevelBadge({
  xp,
  className,
}: {
  xp: number;
  className?: string;
}) {
  const { level } = levelProgress(xp);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-transparent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning",
        className,
      )}
      title={`Level ${level}`}
    >
      <Star className="size-3 fill-current" />
      {level}
    </span>
  );
}

interface PlayerLevelHeaderProps {
  username: string;
  xp: number;
  /** Numeric cosmetic template ID — resolves to the avatar image path. Defaults to 0. */
  avatar?: number;
  /** Tailwind gradient/border classes for the avatar ring. */
  borderClassName?: string;
}

/** Avatar + username + level + XP progress bar in a single horizontal row. */
export function PlayerLevelHeader({
  username,
  xp,
  avatar,
  borderClassName,
}: PlayerLevelHeaderProps) {
  const [open, setOpen] = useState(false);
  const progress = levelProgress(xp);
  const initials = username.slice(0, 2).toUpperCase();
  const avatarImage = getAvatarByTemplateId(
    avatar ?? DEFAULT_AVATAR_TEMPLATE_ID,
  )?.image;
  const detail = `${formatInt(progress.intoLevel)} / ${formatInt(progress.levelSpan)} XP to level ${progress.level + 1}`;

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {/* Avatar — placeholder initials until shop cosmetics are wired in. */}
      <div
        className={cn(
          "size-12 shrink-0 rounded-full p-[2px] sm:size-14",
          borderClassName ??
            "bg-gradient-to-tr from-primary via-accent to-success",
        )}
      >
        <div className="grid size-full place-items-center overflow-hidden rounded-full border-2 border-card bg-secondary text-sm font-semibold text-primary-foreground">
          {avatarImage ? (
            <img
              src={avatarImage}
              alt={username}
              className="size-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
      </div>

      {/* Identity + progress row */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {username}
          </h1>
          <LevelBadge xp={xp} className="px-2 py-1 text-xs" />
        </div>

        <div className="flex w-full items-center gap-2">
          <Progress value={progress.percent} className="h-2.5 flex-1" />
          <TooltipProvider delayDuration={100}>
            <Tooltip open={open} onOpenChange={setOpen}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={detail}
                  onClick={() => setOpen((v) => !v)}
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                <p className="font-mono text-xs">{detail}</p>
                <p className="mt-0.5 text-[10px] opacity-70">
                  {formatInt(progress.xp)} total XP · next at{" "}
                  {formatInt(progress.nextLevelXp)}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
