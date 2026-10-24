import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/test.ts", "server/**/test.ts", "tests/**/*.test.ts", "**/*.test.ts"], exclude: ["node_modules/**"] },
});
