import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

interface Params {
  params: Promise<{ id: string }>
}

// Theme is intentionally permissive in v1 — only two fields are surfaced in
// the dashboard editor; anything else passed through stays on the row for
// later batches without needing another migration.
const themeSchema = z.object({
  greeting: z.string().max(500).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.enum(["bottom-right", "bottom-left"]).optional(),
}).passthrough()

const patchSchema = z.object({
  allowedOrigins: z.array(z.string().max(255)).max(50).optional(),
  themeJson: themeSchema.optional(),
  isActive: z.boolean().optional(),
})

function generatePublicKey(): string {
  // 24 hex chars => 96 bits of entropy. Prefix marks it as a live public
  // key so it's visually distinct from any other ID floating around.
  return `pk_live_${randomBytes(12).toString("hex")}`
}

async function loadAgentForUser(agentId: string, userId: string, isAdmin: boolean) {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, userId: true },
  })
  if (!agent) return { error: "Agent not found" as const, status: 404 }
  if (agent.userId !== userId && !isAdmin) return { error: "Forbidden" as const, status: 403 }
  return { agent }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const res = await loadAgentForUser(id, session.user.id, session.user.role === "ADMIN")
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status })

  // Lazy-create: returning a config row for every Agent that opens this tab
  // means we don't need a separate "Enable Embed" toggle on the UI side.
  let site = await db.embedSite.findUnique({ where: { agentId: id } })
  if (!site) {
    site = await db.embedSite.create({
      data: {
        agentId: id,
        publicKey: generatePublicKey(),
        allowedOrigins: [],
        themeJson: {
          greeting: "Hi! 👋 How can I help today?",
          primaryColor: "#00DC82",
          position: "bottom-right",
        },
        isActive: true,
      },
    })
  }

  return NextResponse.json({
    embed: {
      id: site.id,
      publicKey: site.publicKey,
      allowedOrigins: site.allowedOrigins,
      themeJson: site.themeJson,
      isActive: site.isActive,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const res = await loadAgentForUser(id, session.user.id, session.user.role === "ADMIN")
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status })

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
  }

  // Normalize allowedOrigins: strip whitespace, drop empties, dedupe.
  // We deliberately do NOT validate origin format here so the dashboard can
  // show meaningful errors next to each row if needed later; for now we just
  // trust the user to paste a real origin.
  const normalizedOrigins = parsed.data.allowedOrigins
    ? Array.from(new Set(parsed.data.allowedOrigins.map((o) => o.trim()).filter(Boolean)))
    : undefined

  // Prisma's Json input typing rejects loose record shapes; cast through any
  // to mirror what existing routes do (see /api/agents/[id]/route.ts).
  const themeForUpdate = parsed.data.themeJson as unknown
  const themeForCreate = (parsed.data.themeJson ?? {
    greeting: "Hi! 👋 How can I help today?",
    primaryColor: "#00DC82",
    position: "bottom-right",
  }) as unknown

  const site = await db.embedSite.upsert({
    where: { agentId: id },
    update: {
      ...(normalizedOrigins !== undefined && { allowedOrigins: normalizedOrigins }),
      ...(parsed.data.themeJson !== undefined && { themeJson: themeForUpdate as never }),
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
    },
    create: {
      agentId: id,
      publicKey: generatePublicKey(),
      allowedOrigins: normalizedOrigins ?? [],
      themeJson: themeForCreate as never,
      isActive: parsed.data.isActive ?? true,
    },
  })

  return NextResponse.json({
    embed: {
      id: site.id,
      publicKey: site.publicKey,
      allowedOrigins: site.allowedOrigins,
      themeJson: site.themeJson,
      isActive: site.isActive,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    },
  })
}
