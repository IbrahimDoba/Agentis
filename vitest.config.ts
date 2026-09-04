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
    server: {
      deps: {
        // next-auth reaches for "next/server", which Node's ESM resolver can't
        // follow when the package is left external ("Did you mean next/server.js?").
        // Inlining lets vite resolve it, which is what makes it possible to
        // import an API route in a test at all — without it, every route that
        // imports @/lib/auth fails at module load.
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
