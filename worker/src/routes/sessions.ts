import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { sessionManager } from "../baileys/session-manager.js"
import { getSessionByAgentId, deleteSession, updateWarmupTier } from "../db/queries.js"
import { NotFoundError } from "../lib/errors.js"
import { resolvePhone } from "../baileys/contacts-store.js"

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/sessions — create a new session
  app.post("/sessions", async (req, reply) => {
    const body = z.object({ agentId: z.string(), initialTier: z.number().int().min(1).max(4).optional() }).parse(req.body)
    const session = await sessionManager.create(body.agentId, body.initialTier)
    reply.code(201).send(session)
  })

  // PATCH /v1/sessions/:agentId/tier — update warmup tier on an existing session
  app.patch<{ Params: { agentId: string } }>("/sessions/:agentId/tier", async (req, reply) => {
    const { tier } = z.object({ tier: z.number().int().min(1).max(4) }).parse(req.body)
    const session = await getSessionByAgentId(req.params.agentId)
    if (!session) throw new NotFoundError("Session")
    await updateWarmupTier(req.params.agentId, tier)
    reply.send({ ok: true })
  })

  // GET /v1/sessions/:agentId — get session status
  app.get<{ Params: { agentId: string } }>("/sessions/:agentId", async (req, reply) => {
    const session = await getSessionByAgentId(req.params.agentId)
    if (!session) throw new NotFoundError("Session")
    reply.send(session)
  })

  // POST /v1/sessions/:agentId/disconnect — stop socket, preserve auth + DB record
  app.post<{ Params: { agentId: string } }>("/sessions/:agentId/disconnect", async (req, reply) => {
    await sessionManager.disconnect(req.params.agentId)
    reply.send({ ok: true })
  })

  // DELETE /v1/sessions/:agentId — full wipe: logout, delete auth files + DB record
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

  // POST /v1/sessions/:agentId/resolve-phones — resolve LID/JID identifiers to phone numbers
  app.post<{ Params: { agentId: string } }>("/sessions/:agentId/resolve-phones", async (req, reply) => {
    const body = z.object({ ids: z.array(z.string()).max(500) }).parse(req.body)
    const { agentId } = req.params

    const resolved = body.ids.map((raw) => {
      const input = raw.trim()
      if (!input) return { id: raw, phoneNumber: "" }

      const normalized = input.includes("@")
        ? input
        : `${input.replace(/\D/g, "")}@${input.replace(/\D/g, "").length > 13 ? "lid" : "s.whatsapp.net"}`

      return {
        id: raw,
        phoneNumber: resolvePhone(agentId, normalized),
      }
    })

    reply.send({ resolved })
  })

  // POST /v1/sessions/:agentId/pairing-code — request pairing code (no camera needed)
  app.post<{ Params: { agentId: string } }>("/sessions/:agentId/pairing-code", async (req, reply) => {
    const body = z.object({ phoneNumber: z.string().min(7) }).parse(req.body)
    const code = await sessionManager.requestPairingCode(req.params.agentId, body.phoneNumber)
    reply.send({ code })
  })
}
