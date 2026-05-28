import { defineConfig } from "vitest/config"

// Stop vitest from walking up and picking up the workspace-root config
// (which loads .env.local from the Next.js app and requires DATABASE_URL).
// The worker's tests are pure unit tests against in-memory logic — no DB.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
