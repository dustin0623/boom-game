import type { Metadata } from "next";
import { SocketProvider } from "@/context/SocketContext";
import { config }           from "@/lib/config/config";
import { getChainBranding } from "@/lib/config/branding";

const branding = getChainBranding(config.blockchain.chain);

export const metadata: Metadata = {
  title: "Play",
  description: `Play ${branding.gameName}. Heroes plant bombs to mine ${branding.tokenName}.`,
};

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>;
}
