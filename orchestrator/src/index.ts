import Fastify from "fastify"
import helmet from "@fastify/helmet"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import { config } from "./config.js"
import { logger } from "./lib/logger.js"
import { getRedis, closeRedis } from "./queue/redis.js"
import { healthRoutes } from "./routes/health.js"
import { inboundRoutes } from "./routes/inbound.js"
import { documentsRoutes } from "./routes/documents.js"
import { mediaRoutes } from "./routes/media.js"
import { startInboundWorker } from "./queue/workers/inbound-worker.js"
import { startEmbedWorker } from "./queue/workers/embed-worker.js"

const app = Fastify({ logger: false })

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

// Auth — validate ORCHESTRATOR_API_KEY on every non-health request
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/v1/health") return
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token || token !== config.ORCHESTRATOR_API_KEY) {
    reply.code(401).send({ error: "Unauthorized" })
  }
})

await app.register(healthRoutes, { prefix: "/v1" })
await app.register(inboundRoutes, { prefix: "/v1" })
await app.register(documentsRoutes, { prefix: "/v1" })
await app.register(mediaRoutes, { prefix: "/v1" })

// Start BullMQ workers
const inboundWorker = startInboundWorker()
const embedWorker = startEmbedWorker()

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down orchestrator...")
  await inboundWorker.close()
  await embedWorker.close()
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
