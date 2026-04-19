import type { FastifyInstance } from "fastify"
import { inboundQueue } from "../queue/queues.js"

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    const queueDepth = await inboundQueue.count().catch(() => -1)
    return reply.send({
      status: "ok",
      service: "dailzero-orchestrator",
      timestamp: new Date().toISOString(),
      queues: { inbound: queueDepth },
    })
  })
}
