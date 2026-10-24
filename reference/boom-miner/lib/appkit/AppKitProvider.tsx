"use client";

import React, { useEffect } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiAdapter } from "./config";

// Import config so the AppKit singleton is created exactly once.
import "./config";

interface Props {
  children: React.ReactNode;
}

// One QueryClient per render tree (never recreate across re-renders).
const queryClient = new QueryClient();

type ShadowElement = Element & { shadowRoot?: ShadowRoot | null };

/**
 * AppKit modal actual DOM layout (verified by runtime inspection):
 *
 *   w3m-modal                        [shadowRoot]
 *     w3m-router                     [shadowRoot]
 *       w3m-router-container         [in router SR; has own SR + <slot>]
 *         w3m-connect-view           [light DOM child of container — via slot]
 *           [shadowRoot]
 *             w3m-wallet-login-list  [shadowRoot]
 *               w3m-connector-list   [shadowRoot]
 *                 w3m-list-wallet[data-testid="wallet-selector-<id>"]
 *               w3m-all-wallets-widget   ← "Search Wallet 70+" — hide this
 *
 * Hides: WalletConnect entry + all-wallets search widget.
 * Keeps: MetaMask, Rabby (EIP-6963 injected), Phantom, Solflare, Backpack.
 */
function filterWalletModal() {
  const modal = document.querySelector("w3m-modal");
  if (!modal) return;

  const router = (modal as ShadowElement).shadowRoot?.querySelector("w3m-router");
  const container = (router as ShadowElement | null | undefined)?.shadowRoot?.querySelector("w3m-router-container");
  // w3m-connect-view is slotted as a light-DOM child of w3m-router-container
  const connectView = container?.querySelector("w3m-connect-view");
  const loginListEl = (connectView as ShadowElement | null | undefined)?.shadowRoot?.querySelector("w3m-wallet-login-list");
  const loginListSR = (loginListEl as ShadowElement | null | undefined)?.shadowRoot;
  if (!loginListSR) return;

  // 1 — Hide "Search Wallet 70+" widget
  const allWidget = loginListSR.querySelector("w3m-all-wallets-widget") as HTMLElement | null;
  if (allWidget) allWidget.style.display = "none";

  // 2 — Hide WalletConnect entry inside w3m-connector-list
  const connList = loginListSR.querySelector("w3m-connector-list");
  const connListSR = (connList as ShadowElement | null | undefined)?.shadowRoot;
  if (!connListSR) return;

  connListSR.querySelectorAll("w3m-list-wallet").forEach((wallet) => {
    const testid = (wallet.getAttribute("data-testid") ?? "").toLowerCase();
    if (testid.includes("walletconnect")) {
      (wallet as HTMLElement).style.display = "none";
    }
  });
}

function useWalletListFilter() {
  useEffect(() => {
    filterWalletModal();
    const interval = setInterval(filterWalletModal, 300);
    return () => clearInterval(interval);
  }, []);
}

export function AppKitProvider({ children }: Props) {
  useWalletListFilter();

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
