import { useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand/Brand";
import { ConnectGate } from "@/components/auth/ConnectGate";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/features/stores/auth.store";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./SidebarNav";
import { PUBLIC_PAGE_PATHS } from "./nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const hydrated = useHydrated();
  const player = useAuthStore((s) => s.player);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPublic = PUBLIC_PAGE_PATHS.includes(pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarNav collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Menu className="size-4" />
          </button>
          <Link to="/" className="ml-auto flex items-center">
            <BrandLogo className="h-6" />
          </Link>
        </header>

        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          {!hydrated ? (
            <div className="grid min-h-[60vh] place-items-center">
              <div className="relative flex items-center justify-center">
                <div className="absolute size-14 rounded-full border border-primary/20" />
                <div className="absolute size-14 animate-spin rounded-full border-t-2 border-primary" />
                <div className="size-3 rounded-full bg-primary" />
              </div>
            </div>
          ) : isPublic || player ? (
            <div className="mx-auto min-h-full w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
          ) : (
            <ConnectGate />
          )}
        </main>
      </div>
    </div>
  );
}
