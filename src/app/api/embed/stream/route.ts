import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { resolveEmbedSite } from "@/lib/embed-auth"
import { corsHeadersFor, isAllowedOrigin, preflight } from "@/lib/embed-cors"
import { subscribeByConversation } from "@/lib/sse-store"

// Server-sent events stream for the embed widget. Replaces the 2.5s polling
// loop in public/embed/v1.js — the widget opens an EventSource here and the
// orchestrator's publishSseEvent (already published per-conversation) is fanned
// out via Redis pub/sub to every open visitor connection.
//
// Public-by-design: same auth model as the other /api/embed/* routes —
// publicKey + origin + per-visitor conversation ownership. There is no
// session token; the widget identifies its visitor via the same UUID it
// already uses for polling.

const querySchema = z.object({
  publicKey: z.string().min(8).max(128),
  visitorId: z.string().min(8).max(128),
  conversationId: z.string().min(8).max(64),
})

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")
  const url = req.nextUrl
  const parsed = querySchema.safeParse({
    publicKey: url.searchParams.get("publicKey") ?? "",
    visitorId: url.searchParams.get("visitorId") ?? "",
    conversationId: url.searchParams.get("conversationId") ?? "",
  })
  if (!parsed.success) {
    return new Response("Invalid query", {
      status: 400,
      headers: corsHeadersFor(origin, []),
    })
  }

  const { publicKey, visitorId, conversationId } = parsed.data

  const site = await resolveEmbedSite(publicKey)
  if (!site) {
    return new Response("Widget not found or disabled", {
      status: 404,
      headers: corsHeadersFor(origin, []),
    })
  }
  if (!isAllowedOrigin(origin, site.allowedOrigins)) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: corsHeadersFor(origin, site.allowedOrigins),
    })
  }

  // Conversation ownership: enforced ONCE at stream open (vs. on every poll
  // before). After this passes, the visitor's stream stays subscribed until
  // disconnect — no further DB hits per event.
  const conv = await db.conversation.findFirst({
    where: {
      id: conversationId,
      agentId: site.agentId,
      channel: "embed",
      visitorId,
    },
    select: { id: true },
  })
  if (!conv) {
    return new Response("Conversation not found", {
      status: 404,
      headers: corsHeadersFor(origin, site.allowedOrigins),
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Mark the stream open immediately so EventSource fires `open`.
      controller.enqueue(encoder.encode(": connected\n\n"))

      const unsub = subscribeByConversation(site.agentId, conversationId, controller)

      // Keepalive comment so proxies/Cloudflare don't drop an idle stream.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          /* stream closed — abort handler cleans up */
        }
      }, 25000)

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive)
        unsub()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeadersFor(origin, site.allowedOrigins),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
