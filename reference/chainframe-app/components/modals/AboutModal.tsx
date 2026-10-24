import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  ExternalLink,
  Info,
  MessageCircle,
} from "lucide-react";

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Root as Dialog,
  Trigger as DialogTrigger,
} from "@radix-ui/react-dialog";
import { getHiveTreasuryAccount } from "@/lib/utils/hive/wallet";

export function AboutModal({ children }: { children: ReactNode }) {
  const treasury = getHiveTreasuryAccount().trim();
  const links = [
    {
      label: "PeakD",
      value: treasury ? `@${treasury}` : "Treasury account not configured",
      href: treasury
        ? `https://peakd.com/@${encodeURIComponent(treasury)}`
        : "",
      icon: BookOpen,
    },
    {
      label: "Discord",
      value: "Open Discord",
      href: "https://discord.gg/tBBPhRt7kW",
      icon: MessageCircle,
    },
    {
      label: "Tribaldex",
      value: "Trade HASH",
      href: "https://tribaldex.com/trade/HASH",
      icon: ArrowLeftRight,
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-primary">
              <Info className="size-4" />
            </span>
            About $HASH
          </DialogTitle>
          <DialogDescription>
            $HASH is the community token on Hive powering this idle mining game.
            Follow announcements on PeakD, open Discord, or trade HASH on
            Tribaldex.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href || undefined}
              target={link.href ? "_blank" : undefined}
              rel={link.href ? "noopener noreferrer" : undefined}
              aria-disabled={!link.href || undefined}
              role={link.href ? undefined : "link"}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline focus-visible:outline-primary aria-disabled:opacity-60"
            >
              <link.icon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">
                  {link.label}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {link.value}
                </p>
              </div>
              {link.href ? (
                <ExternalLink
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
