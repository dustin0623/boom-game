import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { config } from "@/lib/config/config";
import { getChainBranding } from "@/lib/config/branding";
import { AppKitProvider } from "@/lib/appkit/AppKitProvider";

const branding = getChainBranding(config.blockchain.chain);

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://boomminer.com";

export const metadata: Metadata = {
  title: {
    default: branding.gameName,
    template: `%s — ${branding.gameName}`,
  },
  description: `${branding.gameName} — auto-battler where heroes plant bombs to mine ${branding.tokenName}.`,
  openGraph: {
    title: branding.gameName,
    description: `Auto-battler where heroes plant bombs to mine ${branding.tokenName}.`,
    type: "website",
    url: baseUrl,
    images: [
      {
        url: branding.ogImage.startsWith("http")
          ? branding.ogImage
          : `${baseUrl}${branding.ogImage}`,
        width: 1200,
        height: 630,
        alt: branding.gameName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@BoomMiner",
    title: branding.gameName,
    description: `Auto-battler where heroes plant bombs to mine ${branding.tokenName}.`,
    images: [
      branding.ogImage.startsWith("http")
        ? branding.ogImage
        : `${baseUrl}${branding.ogImage}`,
    ],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "android-chrome",
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        rel: "android-chrome",
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-background">
      <body>
        <AppKitProvider>
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}
