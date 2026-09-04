import { defineConfig } from "vitest/config"

// Pin the orchestrator's own test root and give it a self-contained env.
//
// Without this file vitest walks up to the workspace-root config, whose setup
// file loads the Next.js app's .env.local. That is the ONLY reason these tests
// passed: src/config.ts validates the whole env at module scope and calls
// process.exit(1) when it fails, so importing almost anything here (db/client,
// queue/redis) needs a fully-populated environment. The tests were quietly
// depending on a developer having real production-shaped secrets on disk, and
// on a root config that knows nothing about this package.
//
// The env below is fake-but-schema-valid, so the tests are hermetic and can run
// in CI with no secrets. REDIS_URL points at a host that need not exist: the
// queue modules construct BullMQ Queues at module scope, and a failed connection
// is retried in the background without failing a test that never awaits it.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      ORCHESTRATOR_API_KEY: "test-orchestrator-key-0000",
      WORKER_API_KEY: "test-worker-key-000000000",
      // Fake by default, so the suite stays hermetic. The database-backed
      // tests in db/queries/*.integration.test.ts skip themselves when the
      // connection fails, and run only when a real URL is passed in here
      // explicitly — never by picking one up from a developer's .env.local.
      DATABASE_URL: process.env.INTEGRATION_DATABASE_URL ?? "postgresql://test:test@127.0.0.1:5432/test",
      REDIS_URL: "redis://127.0.0.1:6379",
      OPENAI_API_KEY: "test-openai-key",
      CLOUDFLARE_R2_ACCOUNT_ID: "test-account",
      CLOUDFLARE_R2_BUCKET: "test-bucket",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "test-access-key",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "test-secret-key",
    },
  },
})
