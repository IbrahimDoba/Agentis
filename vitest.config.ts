import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Tests run against the REAL local dev DB (project rule: no DB mocking).
// vitest.setup.ts loads .env.local so DATABASE_URL points at the dev branch.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Neon is a remote serverless DB — give queries room on cold starts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // DB tests share rows; run files serially to keep assertions deterministic.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
