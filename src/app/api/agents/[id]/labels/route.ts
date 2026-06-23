import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

// Read + configure an agent's WhatsApp labels (synced from the phone) and the
// chat-tagging toggle. The "mix" config lives here: mark labels as stage vs
// additive, order the stage funnel, and optionally set a per-label rule.

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, chatTaggingEnabled: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const labels = await db.whatsAppLabel.findMany({
    where: { agentId: id, deleted: false },
    orderBy: [{ isStage: "desc" }, { stageOrder: "asc" }, { name: "asc" }],
    select: { waLabelId: true, name: true, color: true, isStage: true, stageOrder: true, applyRule: true },
  })

  return NextResponse.json({ chatTaggingEnabled: agent.chatTaggingEnabled, labels })
}

const patchSchema = z.object({
  chatTaggingEnabled: z.boolean().optional(),
  labels: z.array(z.object({
    waLabelId: z.string().min(1),
    isStage: z.boolean().optional(),
    stageOrder: z.number().int().nullable().optional(),
    applyRule: z.string().max(300).nullable().optional(),
  })).optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({ where: { id, userId: session.user.id }, select: { id: true } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  const body = parsed.data

  if (typeof body.chatTaggingEnabled === "boolean") {
    await db.agent.update({ where: { id }, data: { chatTaggingEnabled: body.chatTaggingEnabled } })
  }

  if (body.labels?.length) {
    // updateMany scoped to (agentId, waLabelId) — can't update a label the
    // caller doesn't own, and a stale waLabelId just affects 0 rows.
    await Promise.all(body.labels.map((l) =>
      db.whatsAppLabel.updateMany({
        where: { agentId: id, waLabelId: l.waLabelId },
        data: {
          ...(l.isStage !== undefined ? { isStage: l.isStage } : {}),
          ...(l.stageOrder !== undefined ? { stageOrder: l.stageOrder } : {}),
          ...(l.applyRule !== undefined ? { applyRule: l.applyRule } : {}),
        },
      })
    ))
  }

  return NextResponse.json({ ok: true })
}
