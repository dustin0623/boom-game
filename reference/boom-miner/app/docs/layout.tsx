import type { Metadata } from "next";
import type { ReactNode } from "react";
import { config }           from "@/lib/config/config";
import { getChainBranding } from "@/lib/config/branding";

const branding = getChainBranding(config.blockchain.chain);

export const metadata: Metadata = {
  title: `Docs — ${branding.gameName}`,
  description:
    `Complete game documentation for ${branding.gameName} — mechanics, hero rarities, chest rarities, energy system, and stage generation.`,
  openGraph: {
    title: `Docs — ${branding.gameName}`,
    description: `Complete game documentation for ${branding.gameName}.`,
    type: "website",
  },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
