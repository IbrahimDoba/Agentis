import { z } from "zod"
import "dotenv/config"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4100),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  ORCHESTRATOR_API_KEY: z.string().min(16),

  // HMAC secret for browser SSE stream tickets (must match the Next.js app's
  // STREAM_TOKEN_SECRET). Optional so the orchestrator still boots before the
  // streaming feature is rolled out — the /v1/stream routes 503 until it's set.
  STREAM_TOKEN_SECRET: z.string().min(16).optional().or(z.literal("").transform(() => undefined)),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // The Dokploy platform still injects the DECOMMISSIONED Railway worker URL via
  // its (encrypted, hard-to-edit) env on every redeploy, which silently breaks
  // all AI-reply dispatch until manually patched. The live worker is served at
  // api.dailzero.com. Coerce the dead host to it here so a redeploy can never
  // take the send path down again, regardless of what the env supplies.
  WA_WORKER_URL: z
    .string()
    .url()
    .default("http://localhost:4000")
    .transform((u) => (u.includes("whatsapp-worker-production-143f.up.railway.app") ? "https://api.dailzero.com" : u)),
  WORKER_API_KEY: z.string().min(16),

  // The Next.js app. Only used to dispatch Cloud API ("meta" channel) replies,
  // which must go out with the connected business's own token — held there.
  APP_URL: z.string().url().default("https://www.dailzero.com"),

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
