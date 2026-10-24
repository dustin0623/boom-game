/**
 * lib/config/branding.ts
 *
 * Per-chain branding configuration.
 *
 * This is the ONLY place that defines chain-specific visual identity — game
 * name, token name, logo, token image, and OG image.  All other modules that
 * need branding data should import `getChainBranding()` or the
 * `chainBranding` map from here instead of hard-coding strings.
 *
 * Safe to import from both server and client modules (no process.env reads).
 */

import type { SupportedChain } from "./config";

export interface ChainBranding {
  /** Human-readable game name shown in the UI and metadata. */
  gameName: string;
  /** On-chain token ticker shown next to balances (e.g. "$BMCOIN"). */
  tokenName: string;
  /**
   * Path (relative to /public) or absolute URL for the wordmark / logo image
   * displayed in navbars, loaders, and the login page.
   */
  logo: string;
  /**
   * Path (relative to /public) or absolute URL for the token icon used in
   * HUDs, modals, and marketplace rows.
   */
  tokenImage: string;
  /**
   * Path (relative to /public) or absolute URL for the OpenGraph / Twitter
   * card image.  1200×630 px recommended.
   */
  ogImage: string;
}

/**
 * Full branding map.  Add or update a chain's entry here — nowhere else.
 *
 * Robinhood deploys as "Robin Boom" with the $RBOOM token.
 * Solana and Hive keep the default Boom Miner identity.
 */
export const chainBranding: Record<SupportedChain, ChainBranding> = {
  solana: {
    gameName:   "Boom Miner",
    tokenName:  "$BMCOIN",
    logo:       "/assets/brand_logo.png",
    tokenImage: "/assets/token.png",
    ogImage:    "/og-image.png",
  },

  hive: {
    gameName:   "Boom Miner",
    tokenName:  "$BMCOIN",
    logo:       "/assets/brand_logo.png",
    tokenImage: "/assets/token.png",
    ogImage:    "/og-image.png",
  },

  robinhood: {
    gameName:   "Robin Boom",
    tokenName:  "$RBOOM",
    logo:       "/assets/brand_logo_robinhood.png",
    tokenImage: "/assets/token.png",   // swap for $RBOOM token icon when ready
    ogImage:    "/assets/og_robinhood.jpg",
  },
};

/**
 * Returns the branding config for a given chain.
 * Accepts the `SupportedChain` type from lib/config/config.ts.
 *
 * @example
 *   import { config }        from "@/lib/config/config";
 *   import { getChainBranding } from "@/lib/config/branding";
 *
 *   const branding = getChainBranding(config.blockchain.chain);
 *   // branding.gameName  → "Robin Boom"   (on robinhood)
 *   // branding.tokenName → "$RBOOM"        (on robinhood)
 */
export function getChainBranding(chain: SupportedChain): ChainBranding {
  return chainBranding[chain];
}
