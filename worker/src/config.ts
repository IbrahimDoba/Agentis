import { z } from "zod"
import "dotenv/config"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  WORKER_API_KEY: z.string().min(16),

  // The Next.js app. Used only to send Cloud API broadcast templates, which go
  // out with a connected business's own token — held there, not here.
  APP_URL: z.string().url().default("https://www.dailzero.com"),
  DASHBOARD_URL: z.string().url(),
  DASHBOARD_WEBHOOK_SECRET: z.string().min(16),

  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  REDIS_URL: z.string().min(1),

  ORCHESTRATOR_URL: z.string().url().default("http://localhost:4100"),
  ORCHESTRATOR_API_KEY: z.string().min(16),

  OPENAI_API_KEY: z.string().min(1).optional(),

  AUTH_ENCRYPTION_KEY: z.string().min(32),
  AUTH_STORAGE_BUCKET: z.string().default("baileys-auth-backups"),
  // Where Baileys auth sessions live on disk. Point this at a PERSISTENT
  // Railway volume (e.g. /data/auth_sessions) so the folder survives restarts —
  // then the worker stops re-downloading every agent's auth backup from
  // Supabase on each boot (the main source of Supabase egress).
  AUTH_STORAGE_DIR: z.string().default("auth_sessions"),
  // Where Baileys auth state is persisted. "postgres" (default) keeps one row
  // per signal key in the DB — no per-key files, so the auth volume can never
  // exhaust inodes (the root of the duplicate-delivery incident). "file" is the
  // legacy per-file volume store, kept as a one-release escape hatch. On first
  // load in postgres mode an agent with no DB rows is backfilled from its
  // existing local files (zero QR re-scan), then those files are reclaimed.
  AUTH_STORE: z.enum(["postgres", "file"]).default("postgres"),
  // When true, delete an agent's local auth files after they're backfilled into
  // Postgres, reclaiming the inodes. Default FALSE for the first release: keep
  // the files as a live fallback while the DB store is proven in prod. Note that
  // even with this off, switching to the Postgres store STOPS file growth (all
  // writes go to the DB), so inode exhaustion cannot recur — this flag only
  // controls reclaiming the already-written files. Flip to true once confident.
  AUTH_RECLAIM_MIGRATED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  DEFAULT_TIMEZONE: z.string().default("Africa/Lagos"),
  DEFAULT_BUSINESS_HOURS_START: z.string().default("08:00"),
  DEFAULT_BUSINESS_HOURS_END: z.string().default("21:00"),

  ENABLE_WABA_ONBOARDING: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
