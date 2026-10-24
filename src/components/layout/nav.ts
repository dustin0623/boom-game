import type { LucideIcon } from "lucide-react";
import { Users, Gamepad2, ShoppingBag, Store, Trophy } from "lucide-react";

export interface NavItem {
  to: "/play" | "/heroes" | "/shop" | "/marketplace" | "/leaderboard";
  label: string;
  icon: LucideIcon;
}

/** Paths anyone can open without signing in. Everything else needs a wallet session. */
export const PUBLIC_PAGE_PATHS = ["/", "/test-game"];

export const NAV_ITEMS: NavItem[] = [
  { to: "/play", label: "Play", icon: Gamepad2 },
  { to: "/heroes", label: "Heroes", icon: Users },
  { to: "/shop", label: "Shop", icon: Store },
  { to: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];
