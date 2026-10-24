import type { LucideIcon } from "lucide-react";
import { Backpack, Gamepad2, ShoppingBag, Store, Trophy } from "lucide-react";

export interface NavItem {
  to: "/play" | "/inventory" | "/shop" | "/marketplace" | "/leaderboard";
  label: string;
  icon: LucideIcon;
}

/** Paths anyone can open without signing in. Everything else needs a wallet session. */
export const PUBLIC_PAGE_PATHS = ["/"];

export const NAV_ITEMS: NavItem[] = [
  { to: "/play", label: "Play", icon: Gamepad2 },
  { to: "/inventory", label: "Inventory", icon: Backpack },
  { to: "/shop", label: "Shop", icon: Store },
  { to: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];
