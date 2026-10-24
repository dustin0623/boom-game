"use client";

import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { refreshWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { useWorkerStore } from "@/features/stores/workerStore";

import { ConnectGate } from "@/components/auth/ConnectGate";
import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { GameActivityPanel } from "@/components/game/GameActivityPanel";
import {
  useTransactionStore,
  transactionSessionKey,
} from "@/features/stores/transactionStore";
import { SidebarNav } from "@/components/layout/SidebarNav";
import {
  PUBLIC_PAGE_PATHS,
  AUTHENTICATED_BROWSING_PATHS,
} from "@/lib/config/constants/nav";
import { Button } from "@/components/ui/button";
import { SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Root as Sheet } from "@radix-ui/react-dialog";
import { useHydrated } from "@/hooks/useHydrated";
import { usePersonalHistory } from "@/hooks/usePersonalHistory";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/stores/authStore";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { usePlayerStore } from "@/features/stores/playerStore";
import {
  getBackgroundByTemplateId,
  DEFAULT_BACKGROUND_TEMPLATE_ID,
} from "@/features/types/game/templates";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const mode = useAuthStore((state) => state.mode);
  const apiConnected = useAuthStore((state) => state.apiConnected);
  const playerLoaded = usePlayerStore((state) => state.loaded);
  const playerError = usePlayerStore((state) => state.error);
  const inventoryError = useInventoryStore((state) => state.error);
  const inventoryLoaded = useInventoryStore((state) => state.loaded);
  const workerAvailable = useWorkerStore((state) => state.available);
  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const registrationSubmitted = useTransactionStore(
    (state) =>
      state.registrationSubmitted &&
      state.session === transactionSessionKey({ address, mode, connectedAt }),
  );
  const [checkingSession, setCheckingSession] = useState<string | null>(null);
  const checkingWorker =
    checkingSession === JSON.stringify([address, connectedAt]);
  const checkWorker = async () => {
    const session = useAuthStore.getState();
    const current = () => {
      const now = useAuthStore.getState();
      return (
        now.address === session.address &&
        now.connectedAt === session.connectedAt &&
        now.mode === session.mode
      );
    };
    const key = JSON.stringify([session.address, session.connectedAt]);
    setCheckingSession(key);
    try {
      await refreshWorkerReadiness(current);
    } catch {
      /* Session replacement discards old readiness. */
    } finally {
      setCheckingSession((value) => (value === key ? null : value));
    }
  };
  useEffect(() => {
    if (!hydrated || mode !== "wallet" || !apiConnected) return;
    let active = true;
    const session = useAuthStore.getState();
    const current = () =>
      active &&
      useAuthStore.getState().address === session.address &&
      useAuthStore.getState().connectedAt === session.connectedAt;
    const refresh = () => {
      void refreshWorkerReadiness(current).catch(() => {});
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [hydrated, mode, apiConnected, address, connectedAt, pathname]);
  usePersonalHistory(hydrated && mode === "wallet" && apiConnected === true);
  const authenticated = mode === "wallet" && apiConnected === true && !!address;
  const registration = useAuthStore((state) => state.isRegistered);
  // Unknown registration never authorizes gameplay. Authenticated read pages
  // do not depend on gameplay cache hydration or registration.
  const needsRegistration = useAuthStore(
    (state) =>
      state.mode === "wallet" &&
      state.apiConnected === true &&
      state.address !== null &&
      state.isRegistered === false,
  );
  const connected = authenticated && registration === true;
  const isPublicRoute = PUBLIC_PAGE_PATHS.some((path) => path === pathname);
  const isBrowsingRoute = AUTHENTICATED_BROWSING_PATHS.some(
    (path) => path === pathname,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Resolve background: use player's selected background when connected,
  // fall back to the default (001) for guests. Applied on all routes.
  const selectedBackgroundId = usePlayerStore((state) => state.background);
  const backgroundId = connected
    ? (selectedBackgroundId ?? DEFAULT_BACKGROUND_TEMPLATE_ID)
    : DEFAULT_BACKGROUND_TEMPLATE_ID;
  const bgImage = getBackgroundByTemplateId(backgroundId)?.image;

  return (
    <div className="h-screen overflow-hidden text-foreground">
      <div className="flex h-full">
        <aside
          className={cn(
            "relative hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col",
            collapsed ? "w-[56px]" : "w-[240px]",
          )}
        >
          <SidebarNav
            collapsed={collapsed}
            showBalances={hydrated && connected && playerLoaded}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[80vw] max-w-[280px] border-0 bg-sidebar p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav
              showBalances={hydrated && connected}
              onNavigate={() => setMobileOpen(false)}
            />
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
            <Link
              href="/"
              className="ml-auto flex items-center focus:outline-none"
            >
              <BrandLogo className="h-6" />
            </Link>
          </header>

          <main
            className="relative flex-1 overflow-y-auto overflow-x-hidden"
            style={
              bgImage
                ? {
                    backgroundImage: `linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.75)), url(${bgImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                    backgroundAttachment: "local",
                  }
                : undefined
            }
          >
            <div className="relative z-10">
              {hydrated &&
                authenticated &&
                isBrowsingRoute &&
                registration !== true && (
                  <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-3 text-sm"
                  >
                    <span>
                      {registration === false
                        ? "You can browse. Complete registration to purchase items and join the rankings."
                        : "Checking registration. Browsing remains available; purchases require confirmed registration."}
                    </span>
                    <ConnectWalletModal>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={registration !== false}
                      >
                        Register
                      </Button>
                    </ConnectWalletModal>
                  </div>
                )}
              {hydrated &&
              mode === "wallet" &&
              apiConnected &&
              workerAvailable !== true ? (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-3 text-sm"
                >
                  <span>
                    {workerAvailable === null
                      ? "Checking game processing availability…"
                      : "Game processing is unavailable. New signing and payments are paused; pending transactions may still settle."}
                  </span>
                  <button
                    type="button"
                    disabled={checkingWorker}
                    onClick={() => void checkWorker()}
                    className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
                  >
                    {checkingWorker ? "Checking…" : "Retry availability"}
                  </button>
                </div>
              ) : null}
              {hydrated ? (
                isPublicRoute || (isBrowsingRoute && authenticated) ? (
                  <div className="mx-auto min-h-full w-full min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
                    {children}
                  </div>
                ) : connected && playerLoaded && inventoryLoaded ? (
                  <>
                    <div className="mx-auto min-h-full w-full min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
                      {children}
                    </div>
                  </>
                ) : connected ? (
                  <p
                    role="status"
                    className="p-8 text-sm text-muted-foreground"
                  >
                    {playerError || inventoryError
                      ? "Player or inventory data is unavailable. Retrying…"
                      : "Waiting for player and inventory data from the server…"}
                  </p>
                ) : mode === "wallet" && apiConnected === null ? (
                  <p
                    role="status"
                    className="p-8 text-sm text-muted-foreground"
                  >
                    Restoring your wallet session…
                  </p>
                ) : mode === "wallet" &&
                  apiConnected === true &&
                  !needsRegistration ? (
                  <p
                    role="status"
                    className="p-8 text-sm text-muted-foreground"
                  >
                    Player registration status is unavailable. Reconnect to try
                    again.
                  </p>
                ) : (
                  <ConnectGate />
                )
              ) : (
                <div className="grid min-h-[60vh] place-items-center px-4 py-20">
                  <div className="flex flex-col items-center justify-center">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute h-14 w-14 rounded-full border border-primary/20" />
                      <div className="absolute h-14 w-14 rounded-full border-t-2 border-primary animate-spin" />
                      <div className="h-3 w-3 rounded-full bg-primary" />
                    </div>
                    <p className="mt-5 text-sm font-medium text-muted-foreground animate-pulse">
                      Loading your rig…
                    </p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Session-scoped submissions and statistics remain available before registration. */}
      {hydrated && mode === "wallet" && apiConnected === true && address && (
        <GameActivityPanel />
      )}

      {/* Gameplay retains forced registration; read-only browsing has an explicit entry point. */}
      {hydrated &&
        needsRegistration &&
        !isPublicRoute &&
        !isBrowsingRoute &&
        !registrationSubmitted && (
          <ConnectWalletModal open onOpenChange={() => {}} />
        )}
    </div>
  );
}
