import type { LucideIcon } from "lucide-react";
import { Backpack, LayoutDashboard, ShoppingBag, Store, Trophy } from "lucide-react";

export interface NavItem {
  to: "/dashboard" | "/inventory" | "/shop" | "/marketplace" | "/leaderboard";
  label: string;
  icon: LucideIcon;
}

/** Paths anyone can open without signing in. */
export const PUBLIC_PAGE_PATHS = ["/"];

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Backpack },
  { to: "/shop", label: "Shop", icon: Store },
  { to: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];
