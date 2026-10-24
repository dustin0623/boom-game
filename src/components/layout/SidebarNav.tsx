import { Link, useLocation } from "@tanstack/react-router";
import { LogOut, PanelLeft, Wallet } from "lucide-react";
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
  return (
    <div className={cn("px-2 pb-2", collapsed && "flex justify-center")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-left transition hover:border-primary/40",
              collapsed && "size-9 justify-center p-0",
            )}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              {address.slice(1, 3).toUpperCase()}
            </span>
            {!collapsed && <span className="truncate font-mono text-[12px]">{short(address)}</span>}
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
    </div>
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
