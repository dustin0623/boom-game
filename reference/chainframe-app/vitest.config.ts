import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "features/events/**/test.ts",
      "tests/integration/**/*.test.ts",
      "features/events/**/*.test.ts",
      "features/stores/**/*.test.ts",
      "features/types/**/*.test.ts",
      "lib/config/**/*.test.ts",
      "lib/utils/**/*.test.ts",
      "app/api/**/*.test.ts",
      "server/game-smart-contract/**/*.test.ts",
      "hooks/**/*.test.ts",
      "components/**/*.test.tsx",
      "lib/*.test.ts",
      "lib/api/**/*.test.ts",
      "lib/chains/**/*.test.ts",
      "lib/chains/**/test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
