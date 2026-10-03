import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

// Read + configure an agent's WhatsApp labels (synced from the phone) and the
// chat-tagging toggle. The "mix" config lives here: mark labels as stage vs
// additive, order the stage funnel, and optionally set a per-label rule.

interface Params { params: Promise<{ id: string }> }

// Thrown inside the transaction to roll back label edits when the request would
// leave allowlist mode on with no allowed labels.
class AllowlistEmptyError extends Error {}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, chatTaggingEnabled: true, backgroundTaggingEnabled: true, labelReplyPolicy: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const labels = await db.whatsAppLabel.findMany({
    where: { agentId: id, deleted: false },
    orderBy: [{ isStage: "desc" }, { stageOrder: "asc" }, { name: "asc" }],
    select: { waLabelId: true, name: true, color: true, isStage: true, stageOrder: true, applyRule: true, aiDisabled: true, aiEnabled: true },
  })

  return NextResponse.json({
    chatTaggingEnabled: agent.chatTaggingEnabled,
    backgroundTaggingEnabled: agent.backgroundTaggingEnabled,
    labelReplyPolicy: agent.labelReplyPolicy,
    labels,
  })
}

const patchSchema = z.object({
  chatTaggingEnabled: z.boolean().optional(),
  backgroundTaggingEnabled: z.boolean().optional(),
  labelReplyPolicy: z.enum(["all", "allowlist"]).optional(),
  labels: z.array(z.object({
    waLabelId: z.string().min(1),
    isStage: z.boolean().optional(),
    stageOrder: z.number().int().nullable().optional(),
    applyRule: z.string().max(300).nullable().optional(),
    aiDisabled: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
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

  const agentData: { chatTaggingEnabled?: boolean; backgroundTaggingEnabled?: boolean; labelReplyPolicy?: string } = {}
  if (typeof body.chatTaggingEnabled === "boolean") agentData.chatTaggingEnabled = body.chatTaggingEnabled
  if (typeof body.backgroundTaggingEnabled === "boolean") agentData.backgroundTaggingEnabled = body.backgroundTaggingEnabled
  if (body.labelReplyPolicy) agentData.labelReplyPolicy = body.labelReplyPolicy

  // One transaction so the allowlist guard below sees the label changes from
  // this same request — selecting labels and switching the mode on arrive
  // together from agent Settings.
  const blocked = await db.$transaction(async (tx) => {
    if (body.labels?.length) {
      // updateMany scoped to (agentId, waLabelId) — can't update a label the
      // caller doesn't own, and a stale waLabelId just affects 0 rows.
      for (const l of body.labels) {
        await tx.whatsAppLabel.updateMany({
          where: { agentId: id, waLabelId: l.waLabelId },
          data: {
            ...(l.isStage !== undefined ? { isStage: l.isStage } : {}),
            ...(l.stageOrder !== undefined ? { stageOrder: l.stageOrder } : {}),
            ...(l.applyRule !== undefined ? { applyRule: l.applyRule } : {}),
            ...(l.aiDisabled !== undefined ? { aiDisabled: l.aiDisabled } : {}),
            ...(l.aiEnabled !== undefined ? { aiEnabled: l.aiEnabled } : {}),
          },
        })
      }
    }

    // Allowlist mode with nothing allowed silences the agent completely, and
    // the owner sees no cause — refuse it instead. Checked against the state
    // AFTER this request's label edits, and only when the mode will be on.
    const policy = agentData.labelReplyPolicy
      ?? (await tx.agent.findUnique({ where: { id }, select: { labelReplyPolicy: true } }))?.labelReplyPolicy
    if (policy === "allowlist") {
      const allowed = await tx.whatsAppLabel.count({ where: { agentId: id, deleted: false, aiEnabled: true } })
      if (allowed === 0) throw new AllowlistEmptyError()
    }

    if (Object.keys(agentData).length > 0) {
      await tx.agent.update({ where: { id }, data: agentData })
    }
    return false
  }).catch((err) => {
    if (err instanceof AllowlistEmptyError) return true
    throw err
  })

  if (blocked) {
    return NextResponse.json(
      { error: "Select at least one label before limiting replies to labelled chats." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
