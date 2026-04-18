import type { FastifyPluginAsync } from "fastify"
import { getRedis } from "../queue/redis.js"

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (_req, reply) => {
    let redisOk = false
    try {
      const r = getRedis()
      await r.ping()
      redisOk = true
    } catch {
      // Redis not ready yet
    }

    reply.send({
      status: "ok",
      redis: redisOk ? "connected" : "disconnected",
      uptime: process.uptime(),
    })
  })
}
