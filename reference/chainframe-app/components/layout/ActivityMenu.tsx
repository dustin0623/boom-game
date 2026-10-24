"use client";

import { useEffect, useState } from "react";
import { Mail, Store } from "lucide-react";
import { PopoverContent } from "@/components/ui/popover";
import {
  Root as Popover,
  Trigger as PopoverTrigger,
} from "@radix-ui/react-popover";
import { useNotificationStore } from "@/features/stores/notificationStore";
import type { ActivityEntry } from "@/features/types/game/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const toneMap: Record<ActivityEntry["kind"], string> = {
  info: "bg-muted-foreground",
  success: "bg-success",
  danger: "bg-danger",
  loot: "bg-accent",
};

export function ActivityMenu() {
  const activity = useNotificationStore((state) => state.activity);
  const [tab, setTab] = useState<"activity" | "market">("activity");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    // Match the sidebar's lg breakpoint: its mobile sheet needs a bottom popover.
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const entries = activity.filter(
    (entry) =>
      /\b(sold|bought|listed|listing|market|purchase|purchased)\b/i.test(
        entry.message,
      ) ===
      (tab === "market"),
  );
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Recent activity"
        className="relative shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Mail className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        align={narrow ? "end" : "start"}
        side={narrow ? "bottom" : "right"}
        sideOffset={narrow ? 8 : 12}
        alignOffset={narrow ? 0 : -8}
        collisionPadding={12}
        avoidCollisions
        className="flex max-h-[70vh] w-[min(24rem,calc(100vw-1.5rem))] flex-col p-0 lg:max-h-[600px]"
      >
        <div className="shrink-0 border-b border-border px-4 pb-0 pt-3">
          <p className="text-[13px] font-semibold">Recent history</p>
          <p className="text-[11px] text-muted-foreground">
            Stay updated with your activity
          </p>
          <div className="mt-3 flex">
            {(["activity", "market"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 pb-2.5 text-[12px] font-medium transition-colors",
                  tab === key
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key === "market" ? (
                  <Store className="size-3.5" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                {key === "market" ? "Market" : "Activity"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="space-y-2">
            {entries.slice(0, 50).map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-2.5 rounded-md px-1 py-1 text-[13px]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    toneMap[entry.kind],
                  )}
                />
                <span className="min-w-0 flex-1">
                  {entry.parts
                    ? entry.parts.map((part, index) => (
                        <span key={index} className={part.className}>
                          {part.text}
                        </span>
                      ))
                    : entry.message}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelativeTime(entry.at)}
                </span>
              </li>
            ))}
          </ul>
          {!entries.length && (
            <p className="px-1 py-8 text-center text-[13px] text-muted-foreground">
              {tab === "market"
                ? "No market history yet."
                : "No recent activity."}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
