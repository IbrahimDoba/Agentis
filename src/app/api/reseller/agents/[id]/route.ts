import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

interface Params { params: Promise<{ id: string }> }

// Editable agent knowledge fields a reseller admin may change on her customers'
// agents. Scoped: the agent's owner must belong to her tenant.
const TEXT_FIELDS = [
  "businessName", "businessDescription", "productsServices", "faqs",
  "operatingHours", "contactEmail", "contactPhone", "websiteLinks", "responseGuidelines",
] as const

export async function GET(_req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findFirst({
    where: { id, user: { resellerId: ctx.resellerId } },
    select: {
      id: true, businessName: true, businessDescription: true, productsServices: true,
      faqs: true, operatingHours: true, contactEmail: true, contactPhone: true,
      websiteLinks: true, responseGuidelines: true, messagingEnabled: true,
      aiRepliesEnabled: true, status: true, agentRuntime: true, whatsappPhoneNumber: true,
      user: { select: { id: true, name: true, email: true, businessName: true } },
    },
  })
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  return NextResponse.json({ agent })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const owned = await db.agent.findFirst({
    where: { id, user: { resellerId: ctx.resellerId } },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: {
    businessName?: string; businessDescription?: string; productsServices?: string
    faqs?: string; operatingHours?: string; contactEmail?: string; contactPhone?: string
    websiteLinks?: string; responseGuidelines?: string; messagingEnabled?: boolean; aiRepliesEnabled?: boolean
  } = {}

  for (const f of TEXT_FIELDS) {
    if (typeof body[f] === "string") (data as Record<string, string>)[f] = body[f]
  }
  if (typeof body.messagingEnabled === "boolean") data.messagingEnabled = body.messagingEnabled
  if (typeof body.aiRepliesEnabled === "boolean") data.aiRepliesEnabled = body.aiRepliesEnabled

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  await db.agent.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}
