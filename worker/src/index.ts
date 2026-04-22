import Fastify from "fastify"
import helmet from "@fastify/helmet"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import { config } from "./config.js"
import { logger } from "./lib/logger.js"
import { getRedis, closeRedis } from "./queue/redis.js"
// ElevenLabs conversation pool removed — orchestrator handles LLM now
import { healthRoutes } from "./routes/health.js"
import { sessionRoutes } from "./routes/sessions.js"
import { messageRoutes } from "./routes/messages.js"
import { broadcastRoutes } from "./routes/broadcasts.js"
import { closeBroadcastQueue } from "./queue/broadcast-queue.js"

const app = Fastify({ logger: false }) // we use pino directly

await app.register(helmet)
await app.register(cors, { origin: config.DASHBOARD_URL })
await app.register(rateLimit, {
  redis: getRedis(),
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.headers["x-client-id"] as string ?? req.ip,
})

// Auth plugin — validates WORKER_API_KEY on every non-health request
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/v1/health") return
  const { safeEqual } = await import("./lib/crypto.js")
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!safeEqual(token, config.WORKER_API_KEY)) {
    reply.code(401).send({ error: "Unauthorized" })
  }
})

await app.register(healthRoutes, { prefix: "/v1" })
await app.register(sessionRoutes, { prefix: "/v1" })
await app.register(messageRoutes, { prefix: "/v1" })
await app.register(broadcastRoutes, { prefix: "/v1" })

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...")
  await closeBroadcastQueue()
  await app.close()
  // closeConversations() — removed, orchestrator handles LLM
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

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" })
  logger.info({ port: config.PORT }, "Worker started")

  // Auto-reconnect sessions that were CONNECTED before restart
  const { sql } = await import("./db/client.js")
  const { sessionManager } = await import("./baileys/session-manager.js")
  const activeSessions = await sql<{ agentId: string }[]>`
    SELECT "agentId" FROM "BaileysSession"
    WHERE "status" IN ('CONNECTED', 'QR_PENDING', 'CONNECTING')
  `
  for (const row of activeSessions) {
    logger.info({ agentId: row.agentId }, "Auto-reconnecting session")
    sessionManager.create(row.agentId).catch((err) =>
      logger.warn({ err, agentId: row.agentId }, "Failed to auto-reconnect session")
    )
  }
} catch (err) {
  logger.error(err, "Failed to start worker")
  process.exit(1)
}
