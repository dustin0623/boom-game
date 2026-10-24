import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phaser uses browser-only globals (window, document, Audio, Canvas).
  // Keep it out of the server bundle so it is never evaluated on the server.
  //
  // @coinbase/cdp-sdk and @base-org/account (pulled in transitively by
  // @wagmi/connectors → @reown/appkit-adapter-wagmi) import optional
  // @x402/* peer deps that are not installed. Marking them as external
  // prevents Turbopack from trying to SSR-bundle them and avoids the
  // "Can't resolve @x402/*" build errors.
  serverExternalPackages: [
    "phaser",
    "@coinbase/cdp-sdk",
    "@base-org/account",
  ],

  // Turbopack configuration for Next.js 16
  turbopack: {},

  webpack(config) {
    // Stub out @x402 optional peer deps so the client bundle never fails
    // when they are absent.
    const x402Stubs = [
      "@x402/core/client",
      "@x402/evm/exact/client",
      "@x402/evm/upto/client",
      "@x402/svm/exact/client",
      "@x402/evm",
    ];
    for (const stub of x402Stubs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config.resolve.alias as Record<string, unknown>)[stub] = false;
    }
    return config;
  },
};

export default nextConfig;
