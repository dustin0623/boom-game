import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Backpack,
  ShoppingBag,
  Store,
  Trophy,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const PUBLIC_PAGE_PATHS = ["/", "/wiki"] as const;
export const AUTHENTICATED_BROWSING_PATHS = [
  "/marketplace",
  "/leaderboard",
] as const;

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Vault, mining, stats and activity",
  },
  {
    to: "/inventory",
    label: "Inventory",
    icon: Backpack,
    description: "All the gear you own",
  },
  {
    to: "/shop",
    label: "Shop",
    icon: Store,
    description: "Open the Equipment Chest, buy Sabotage Devices and Help Kits",
  },
  {
    to: "/marketplace",
    label: "Marketplace",
    icon: ShoppingBag,
    description: "Buy and sell rig parts",
  },
  {
    to: "/leaderboard",
    label: "Leaderboard",
    icon: Trophy,
    description: "Combined Notoriety, mining and XP score",
  },
];
