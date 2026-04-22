import { z } from "zod"
import "dotenv-safe/config.js"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4100),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  ORCHESTRATOR_API_KEY: z.string().min(16),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  WA_WORKER_URL: z.string().url().default("http://localhost:4000"),
  WORKER_API_KEY: z.string().min(16),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_R2_BUCKET: z.string().min(1),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),

  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
