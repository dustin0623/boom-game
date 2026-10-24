import { Link, useLocation } from "@tanstack/react-router";
import { LogOut, Mail, PanelLeft, Star, Wallet, Zap } from "lucide-react";
import { useGameStore } from "@/features/stores/game.store";
import { WalletModal, formatAmount } from "./WalletModal";
import { BrandLogo, TokenIcon } from "@/components/brand/Brand";
import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/features/stores/auth.store";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function AccountRow({ collapsed }: { collapsed: boolean }) {
  const player = useAuthStore((s) => s.player);
  const logout = useAuthStore((s) => s.logout);

  if (!player) {
    if (collapsed) return null;
    return (
      <div className="px-2 pb-2">
        <ConnectWalletModal>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Wallet className="size-3.5 shrink-0" />
            Connect wallet
          </button>
        </ConnectWalletModal>
      </div>
    );
  }

  const address = player.walletAddress ?? player.username;
  const name = player.displayName || player.username;
  return (
    <div className={cn("flex items-center gap-1 px-2 pb-2", collapsed && "justify-center")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-sidebar-accent",
              collapsed && "flex-none justify-center",
            )}
          >
            <span className="size-7 shrink-0 rounded-full bg-gradient-to-tr from-primary via-accent to-success p-[2px]">
              <span className="grid size-full place-items-center rounded-full bg-secondary font-mono text-[10px] font-bold uppercase text-primary">
                {name.slice(0, 2)}
              </span>
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span className="truncate">{short(name)}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                    <Star className="size-3 fill-current" />1
                  </span>
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{short(address)}</span>
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="font-mono text-xs">{short(address)}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="gap-2">
            <LogOut className="size-4" /> Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!collapsed && (
        <button
          type="button"
          aria-label="Recent activity"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <Mail className="size-4" />
        </button>
      )}
    </div>
  );
}

function BalancePanel({ collapsed }: { collapsed: boolean }) {
  const coins = useGameStore((s) => s.coins);
  if (collapsed) {
    return (
      <WalletModal coins={coins}>
        <button
          type="button"
          title="Balances"
          className="mx-auto mb-2 flex size-9 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/40 text-primary transition hover:border-primary/50 hover:bg-primary/10"
        >
          <Wallet className="size-4" />
        </button>
      </WalletModal>
    );
  }
  return (
    <WalletModal coins={coins}>
      <button
        type="button"
        className="group relative mx-2 mb-2 block w-[calc(100%-1rem)] overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/40 via-primary/25 to-background p-3 text-left shadow-lg shadow-primary/20 backdrop-blur-xl transition-all duration-300 hover:border-primary/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/10 via-transparent to-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 size-20 rounded-full bg-accent/25 blur-2xl" />
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <div className="relative">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-foreground/80">Balances</span>
            <Wallet className="size-3 text-foreground/70 transition-colors group-hover:text-primary" />
          </div>
          <div className="mb-2.5">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Coins</p>
            <p className="font-mono text-[17px] font-bold tabular-nums text-foreground">{formatAmount(coins)}</p>
          </div>
          <div className="border-t border-foreground/15 pt-1.5">
            <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <Zap className="size-2.5" /> Sparks
            </p>
            <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground">0</p>
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
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <div className="flex h-full flex-col">
      <div className="group/brand relative flex items-center gap-2 px-3 py-3">
        <Link to="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center justify-center gap-3 rounded-md">
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

      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                collapsed && "justify-center px-0",
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
    </div>
  );
}
