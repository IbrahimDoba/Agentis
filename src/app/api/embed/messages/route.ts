import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { resolveEmbedSite } from "@/lib/embed-auth"
import { corsJson, isAllowedOrigin, preflight } from "@/lib/embed-cors"
import { parseJsonbColumn } from "@/lib/agent-auto-config"

// Polling endpoint — the widget calls this every few seconds to pick up
// new replies. Returns all messages on the conversation newer than the
// `since` cursor (or all of them if `since` is omitted, capped at 100).
//
// This is the v1 transport. Batch 3 may switch to SSE/Realtime later, but
// the polling fallback stays around because it's the dumbest and most
// reliable option (no socket reconnects, no auth-renewal complications).

const querySchema = z.object({
  publicKey: z.string().min(8).max(128),
  visitorId: z.string().min(8).max(128),
  conversationId: z.string().min(8).max(64),
  since: z.string().datetime().optional(),
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
    since: url.searchParams.get("since") ?? undefined,
  })
  if (!parsed.success) {
    return corsJson({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400, origin, allowedOrigins: [] })
  }

  const { publicKey, visitorId, conversationId, since } = parsed.data

  const site = await resolveEmbedSite(publicKey)
  if (!site) {
    return corsJson({ error: "Widget not found or disabled" }, { status: 404, origin, allowedOrigins: [] })
  }
  if (!isAllowedOrigin(origin, site.allowedOrigins)) {
    return corsJson({ error: "Origin not allowed" }, { status: 403, origin, allowedOrigins: site.allowedOrigins })
  }

  // Confirm the conversation belongs to this visitor before returning any
  // message content. Same guard as /api/embed/message.
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
    return corsJson({ error: "Conversation not found" }, { status: 404, origin, allowedOrigins: site.allowedOrigins })
  }

  const messages = await db.message.findMany({
    where: {
      conversationId: conv.id,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      direction: true,
      senderRole: true,
      content: true,
      mediaUrl: true,
      richContent: true,
      createdAt: true,
    },
  })

  return corsJson(
    {
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        senderRole: m.senderRole,
        content: m.content,
        mediaUrl: m.mediaUrl,
        // PrismaNeon adapter returns JSONB as a raw string on some driver
        // paths — parse so the widget gets a real object.
        richContent: parseJsonbColumn<unknown>(m.richContent),
        createdAt: m.createdAt.toISOString(),
      })),
    },
    { status: 200, origin, allowedOrigins: site.allowedOrigins }
  )
}
