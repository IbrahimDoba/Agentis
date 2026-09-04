import Fastify from "fastify"
import helmet from "@fastify/helmet"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import { config } from "./config.js"
import { logger } from "./lib/logger.js"
import { getRedis, closeRedis } from "./queue/redis.js"
import { healthRoutes } from "./routes/health.js"
import { inboundRoutes } from "./routes/inbound.js"
import { chatRoutes } from "./routes/chat.js"
import { documentsRoutes } from "./routes/documents.js"
import { mediaRoutes } from "./routes/media.js"
import { streamRoutes } from "./routes/stream.js"
import { startInboundWorker } from "./queue/workers/inbound-worker.js"
import { startEmbedWorker } from "./queue/workers/embed-worker.js"
import { startCrawlWorker } from "./queue/workers/crawl-worker.js"

// 15MB covers a 10MB raw file after base64 (~33% overhead). Per-route handlers
// still enforce stricter raw-byte limits (documents: 10MB, media: 5MB).
// 40MB: media uploads are base64-in-JSON, so a 25MB document (~34MB encoded) or
// 16MB video (~21MB encoded) must fit. Internal service (API-key gated), so the
// larger ceiling isn't a public DoS surface.
const app = Fastify({ logger: false, bodyLimit: 40 * 1024 * 1024 })

await app.register(helmet)
await app.register(cors, { origin: true })
// await app.register(rateLimit, {
//   redis: getRedis(),
//   max: 500,
//   timeWindow: "1 minute",
//   keyGenerator: (req) => {
//     const body = req.body as Record<string, unknown> | undefined
//     return (body?.agentId as string) ?? req.ip
//   },
// })

// Auth — validate ORCHESTRATOR_API_KEY on every non-health request. The browser
// SSE stream routes are exempt: they carry no server API key (EventSource can't
// set headers) and self-authenticate with a short-lived HMAC ticket instead.
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/v1/health" || req.url.startsWith("/v1/stream/")) return
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token || token !== config.ORCHESTRATOR_API_KEY) {
    reply.code(401).send({ error: "Unauthorized" })
  }
})

await app.register(healthRoutes, { prefix: "/v1" })
await app.register(inboundRoutes, { prefix: "/v1" })
await app.register(chatRoutes, { prefix: "/v1" })
await app.register(documentsRoutes, { prefix: "/v1" })
await app.register(mediaRoutes, { prefix: "/v1" })
await app.register(streamRoutes, { prefix: "/v1" })

// Start BullMQ workers
const inboundWorker = startInboundWorker()
const embedWorker = startEmbedWorker()
const crawlWorker = startCrawlWorker()

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down orchestrator...")
  await inboundWorker.close()
  await embedWorker.close()
  await crawlWorker.close()
  await app.close()
  await closeRedis()
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
process.on("uncaughtException", (err) => {
  logger.error(err, "Uncaught exception")
  process.exit(1)
})
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection")
})

console.log(`[STARTUP] About to listen on port ${config.PORT}`)
try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" })
  console.log(`[STARTUP] Successfully listening on port ${config.PORT}`)
  logger.info({ port: config.PORT }, "Orchestrator started")
} catch (err) {
  console.error(`[STARTUP] Failed to listen on port ${config.PORT}:`, err)
  logger.error(err, "Failed to start orchestrator")
  process.exit(1)
}
