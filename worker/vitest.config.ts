import { defineConfig } from "vitest/config"

// Stop vitest from walking up and picking up the workspace-root config
// (which loads .env.local from the Next.js app and requires DATABASE_URL).
// The worker's tests are pure unit tests against in-memory logic — no DB.
//
// The env below is fake but schema-valid. src/config.ts validates the whole
// environment at module scope and calls process.exit(1) when it fails, so any
// test that transitively imports db/client or webhook-emitter needs a complete
// environment just to load. Locally that was satisfied by an untracked
// worker/.env, which meant the suite passed on developer machines and died in
// CI — exactly the gap CI exists to catch. Nothing here points at a real
// service; these values must never resolve to anything reachable.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      WORKER_API_KEY: "test-worker-key-0000000000",
      DASHBOARD_URL: "http://127.0.0.1:3000",
      DASHBOARD_WEBHOOK_SECRET: "test-dashboard-secret-0000",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      REDIS_URL: "redis://127.0.0.1:6379",
      ORCHESTRATOR_API_KEY: "test-orchestrator-key-0000",
      AUTH_ENCRYPTION_KEY: "test-auth-encryption-key-0123456789",
    },
  },
})
