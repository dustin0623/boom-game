"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, PanelLeft, Wallet, Zap } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { TokenIcon } from "@/components/brand/TokenIcon";

import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { AboutModal } from "@/components/modals/AboutModal";
import { WalletModal } from "@/components/modals/WalletModal";
import { AccountDropdown } from "@/components/layout/AccountDropdown";
import { ActivityMenu } from "@/components/layout/ActivityMenu";
import { NAV_ITEMS } from "@/lib/config/constants/nav";
import { useGameStats } from "@/hooks/useGameStats";
import { formatHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/stores/authStore";
import { usePlayerStore } from "@/features/stores/playerStore";

function AccountRow({ collapsed }: { collapsed: boolean }) {
  const address = useAuthStore((state) => state.address);

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 pb-2",
        collapsed && "justify-center",
      )}
    >
      {address ? (
        <>
          <div className="min-w-0 flex-1">
            <AccountDropdown collapsed={collapsed} />
          </div>
          {!collapsed && <ActivityMenu />}
        </>
      ) : (
        !collapsed && (
          <ConnectWalletModal>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <Wallet className="size-3.5 shrink-0" />
              Connect wallet
            </button>
          </ConnectWalletModal>
        )
      )}
    </div>
  );
}

function BalancePanel({ collapsed }: { collapsed: boolean }) {
  const { wallet } = useGameStats();
  const sparks = usePlayerStore((state) => state.sparks);
  const notoriety = usePlayerStore((state) => state.notoriety);
  const withdrawnToday = usePlayerStore((state) => state.withdrawnToday);
  const withdrawResetAt = usePlayerStore((state) => state.withdrawResetAt);

  if (collapsed) {
    return (
      <WalletModal
        wallet={wallet}
        notoriety={notoriety}
        withdrawnToday={withdrawnToday}
        withdrawResetAt={withdrawResetAt}
      >
        <button
          type="button"
          title="Balances"
          className="mx-auto mb-2 flex size-9 cursor-pointer items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/40 text-primary transition hover:border-primary/50 hover:bg-primary/10"
        >
          <Wallet className="size-4" />
        </button>
      </WalletModal>
    );
  }

  return (
    <WalletModal
      wallet={wallet}
      notoriety={notoriety}
      withdrawnToday={withdrawnToday}
      withdrawResetAt={withdrawResetAt}
    >
      <button
        type="button"
        className={cn(
          "group relative mx-2 mb-2 block w-[calc(100%-1rem)] cursor-pointer overflow-hidden rounded-xl p-3 text-left transition-all duration-300",
          "border border-primary/30 hover:border-primary/60",
          "bg-gradient-to-br from-primary/40 via-primary/25 to-background",
          "shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45),inset_0_1px_0_0_rgba(255,255,255,0.12)]",
          "backdrop-blur-xl hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.6),inset_0_1px_0_0_rgba(255,255,255,0.18)]",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        {/* Glass highlights */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 size-20 rounded-full bg-accent/25 blur-2xl" />
        {/* Sheen */}
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

        <div className="relative">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-foreground/80">
              Balances
            </span>
            <Wallet className="size-3 text-foreground/70 transition-colors group-hover:text-primary" />
          </div>
          <div className="mb-2.5">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              HASH
            </p>
            <p className="font-mono text-[17px] font-bold tabular-nums text-foreground">
              {formatHash(wallet)}
            </p>
          </div>
          <div className="border-t border-foreground/15 pt-1.5">
            <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <Zap className="size-2.5" /> Sparks
            </p>
            <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
              {formatHash(sparks, 4)}
            </p>
          </div>
        </div>
      </button>
    </WalletModal>
  );
}

export function SidebarNav({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  showBalances = false,
}: {
  onNavigate?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
  showBalances?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col overflow-visible">
      <div className="group/brand relative flex items-center gap-2 px-3 py-3">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-3 rounded-md focus:outline-none",
          )}
        >
          <TokenIcon className="size-11 shrink-0" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <BrandLogo className="h-11 w-full object-contain" />
            </span>
          )}
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapse}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-foreground",
              collapsed &&
                "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 bg-sidebar/90 opacity-0 backdrop-blur focus-visible:opacity-100 group-hover/brand:opacity-100",
            )}
          >
            <PanelLeft className="size-4" />
          </button>
        )}
      </div>

      <AccountRow collapsed={collapsed} />

      <div className="mx-3 mb-3 border-t border-sidebar-border/60" />

      {showBalances && <BalancePanel collapsed={collapsed} />}

      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              href={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                collapsed && "justify-center px-0 py-2.5",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-[15px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 px-3 py-3">
        <AboutModal>
          <button
            type="button"
            aria-label="About $HASH"
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20",
              collapsed && "justify-center px-0",
            )}
          >
            <Info className="size-3.5 shrink-0" />
            {!collapsed && <span>About $HASH</span>}
          </button>
        </AboutModal>
      </div>
    </div>
  );
}
