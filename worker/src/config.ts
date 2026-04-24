import { z } from "zod"
import "dotenv/config"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  WORKER_API_KEY: z.string().min(16),
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
