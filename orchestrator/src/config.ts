import { z } from "zod"
import "dotenv-safe/config"

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

  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
