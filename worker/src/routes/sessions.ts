import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { sessionManager } from "../baileys/session-manager.js"
import { getSessionByAgentId, deleteSession } from "../db/queries.js"
import { NotFoundError } from "../lib/errors.js"

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/sessions — create a new session
  app.post("/sessions", async (req, reply) => {
    const body = z.object({ agentId: z.string() }).parse(req.body)
    const session = await sessionManager.create(body.agentId)
    reply.code(201).send(session)
  })

  // GET /v1/sessions/:agentId — get session status
  app.get<{ Params: { agentId: string } }>("/sessions/:agentId", async (req, reply) => {
    const session = await getSessionByAgentId(req.params.agentId)
    if (!session) throw new NotFoundError("Session")
    reply.send(session)
  })

  // DELETE /v1/sessions/:agentId — logout and delete session
  app.delete<{ Params: { agentId: string } }>("/sessions/:agentId", async (req, reply) => {
    await sessionManager.destroy(req.params.agentId)
    reply.code(204).send()
  })

  // GET /v1/sessions/:agentId/qr — SSE stream of QR codes
  app.get<{ Params: { agentId: string } }>("/sessions/:agentId/qr", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    })

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const cleanup = sessionManager.subscribeToQr(req.params.agentId, (qr, status) => {
      send(status === "qr" ? "qr" : "status", { qr, status })
    })

    req.raw.on("close", cleanup)
  })

  // POST /v1/sessions/:agentId/restart — force reconnect
  app.post<{ Params: { agentId: string } }>("/sessions/:agentId/restart", async (req, reply) => {
    await sessionManager.restart(req.params.agentId)
    reply.send({ ok: true })
  })
}
