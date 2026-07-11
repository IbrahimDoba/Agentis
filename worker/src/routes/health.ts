import type { FastifyPluginAsync } from "fastify"
import { getRedis } from "../queue/redis.js"
import { getStorageStatus } from "../baileys/auth-health.js"

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

    // Surface auth-volume health: when this is not "ok" the worker is failing
    // closed (sends paused) to avoid the disk-full duplicate-delivery storm.
    const storage = await getStorageStatus()

    reply.send({
      status: "ok",
      redis: redisOk ? "connected" : "disconnected",
      storage: {
        writable: storage.ok,
        freeMB: Math.round(storage.freeBytes / 1024 / 1024),
        freeInodes: storage.freeInodes,
        ...(storage.reason ? { reason: storage.reason } : {}),
      },
      uptime: process.uptime(),
    })
  })
}
