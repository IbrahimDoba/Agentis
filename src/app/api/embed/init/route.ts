import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { resolveEmbedSite } from "@/lib/embed-auth"
import { corsJson, isAllowedOrigin, preflight } from "@/lib/embed-cors"

// Public bootstrap endpoint. Called once by the widget when it first loads
// on a visitor's browser. Responsibilities:
//   - Validate publicKey + origin
//   - Resolve (or create) the Conversation for this visitor
//   - Return the theme + greeting + conversationId so the widget can render
//
// Identity: the widget owns a stable per-browser UUID stored in localStorage
// and sends it as `visitorId`. Same visitorId twice => same Conversation row.

const bodySchema = z.object({
  publicKey: z.string().min(8).max(128),
  visitorId: z.string().min(8).max(128),
  identify: z
    .object({
      email: z.string().email().optional(),
      name: z.string().max(120).optional(),
    })
    .optional(),
})

export async function OPTIONS(req: NextRequest) {
  // We can't validate against the EmbedSite allowlist here because the
  // browser doesn't send the publicKey on preflight. The real gate is the
  // POST handler below, which returns 403 without an allow header for
  // bad origins.
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin")
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return corsJson(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400, origin, allowedOrigins: [] }
    )
  }

  const { publicKey, visitorId, identify } = parsed.data

  const site = await resolveEmbedSite(publicKey)
  if (!site) {
    return corsJson({ error: "Widget not found or disabled" }, { status: 404, origin, allowedOrigins: [] })
  }

  if (!isAllowedOrigin(origin, site.allowedOrigins)) {
    // Don't leak which check failed — same response whether the origin is
    // wrong, missing, or the key is for a different site.
    return corsJson({ error: "Origin not allowed" }, { status: 403, origin, allowedOrigins: site.allowedOrigins })
  }

  // Idempotent get-or-create on (agentId, channel='embed', visitorId).
  // We use the visitorId as the synthetic phoneNumber to fit the existing
  // unique constraint on (agentId, phoneNumber) without a schema migration.
  const existing = await db.conversation.findFirst({
    where: { agentId: site.agentId, channel: "embed", visitorId },
    select: { id: true, contactName: true, mode: true, createdAt: true },
  })

  let conversationId: string
  if (existing) {
    conversationId = existing.id
    if (identify?.name && !existing.contactName) {
      await db.conversation.update({
        where: { id: existing.id },
        data: { contactName: identify.name },
      })
    }
  } else {
    const created = await db.conversation.create({
      data: {
        agentId: site.agentId,
        phoneNumber: visitorId,
        visitorId,
        channel: "embed",
        contactName: identify?.name ?? null,
        mode: "ai",
      },
      select: { id: true },
    })
    conversationId = created.id
  }

  // Return only the fields the widget actually needs. publicKey is echoed
  // back so the widget can sanity-check it matches what was init'd.
  return corsJson(
    {
      conversationId,
      theme: site.themeJson ?? {},
      publicKey: site.publicKey,
    },
    { status: 200, origin, allowedOrigins: site.allowedOrigins }
  )
}
