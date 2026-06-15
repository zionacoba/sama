import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal config: a Node test environment plus the same `@/` path alias the app
// uses (see tsconfig.json `paths`), so tests can import from `@/lib/...`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
