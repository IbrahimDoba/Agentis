import type { FastifyPluginAsync } from "fastify"
import { config } from "../config.js"
import { verifyStreamToken } from "../lib/stream-token.js"
import { subscribeAgent } from "../lib/sse-hub.js"

// Browser-facing SSE for the dashboard. Replaces the Vercel routes
// /api/agents/[id]/stream and /api/conversations/[id]/stream — the browser
// connects here with a short-lived ticket minted by the Next.js app (which owns
// the session + ownership check), so no serverless function stays open per
// viewer. Exempted from the global Bearer gate in index.ts; auth is the ticket.
export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { agentId: string }; Querystring: { token?: string } }>(
    "/stream/agent/:agentId",
    async (req, reply) => {
      if (!config.STREAM_TOKEN_SECRET) {
        return reply.code(503).send({ error: "Streaming not configured" })
      }

      const { agentId } = req.params
      const claims = verifyStreamToken(req.query.token ?? "")
      // The ticket is scoped to one agent — a valid ticket for agent A must not
      // open agent B's stream.
      if (!claims || claims.agentId !== agentId) {
        return reply.code(401).send({ error: "Invalid or expired stream ticket" })
      }

      // Token is in the query string (EventSource can't set headers); no cookies
      // are used, so a wildcard CORS origin is safe.
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      })
      reply.raw.write(": connected\n\n")

      const unsub = subscribeAgent(agentId, (frame) => reply.raw.write(frame))

      // Keepalive so proxies/load balancers don't drop the idle connection.
      const keepalive = setInterval(() => {
        try {
          reply.raw.write(": ping\n\n")
        } catch {
          /* socket closed — close handler cleans up */
        }
      }, 25000)

      const cleanup = () => {
        clearInterval(keepalive)
        unsub()
      }
      req.raw.on("close", cleanup)
      req.raw.on("error", cleanup)
    },
  )
}
