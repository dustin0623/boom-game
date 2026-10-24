import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    include: ["features/**/*.test.ts", "server/**/*.test.ts", "app/**/*.test.ts", "phaser/**/*.test.ts"],
    exclude: ["reference/**", "node_modules/**"],
    environment: "node",
  },
});
