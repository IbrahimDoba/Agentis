import Fastify from "fastify"
import helmet from "@fastify/helmet"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import { config } from "./config.js"
import { logger } from "./lib/logger.js"
import { getRedis, closeRedis } from "./queue/redis.js"
import { healthRoutes } from "./routes/health.js"
import { sessionRoutes } from "./routes/sessions.js"
import { messageRoutes } from "./routes/messages.js"

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

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...")
  await app.close()
  await closeRedis()
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" })
  logger.info({ port: config.PORT }, "Worker started")
} catch (err) {
  logger.error(err, "Failed to start worker")
  process.exit(1)
}
