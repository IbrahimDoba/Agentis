import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { writeAgentPromptField } from "@/lib/agentPromptWrite"
import { verifyAndApplyEdits, hashValue, PROMPT_EDIT_FIELDS, type EditOp } from "@/lib/promptEdit"

// Apply a previously proposed edit.
//
// The ops arrive from the client, so nothing here is trusted: every op is
// re-verified against the LIVE document before anything is written. A client
// cannot smuggle an arbitrary rewrite past the anchor checks, and beforeHash
// stops a stale proposal from clobbering someone else's edit.

interface Params { params: Promise<{ id: string }> }

/** Snapshots above this are dropped; ops + hashes remain as the rollback path. */
const SNAPSHOT_MAX = 200_000

const opSchema = z.object({
  op: z.enum(["replace", "insert_after", "append"]),
  target: z.enum(PROMPT_EDIT_FIELDS),
  anchor: z.string().nullable(),
  text: z.string(),
  note: z.string(),
})

const bodySchema = z.object({
  instruction: z.string().trim().min(3).max(2000),
  ops: z.array(opSchema).min(1).max(10),
  beforeHash: z.string().min(1),
  model: z.string().max(64).optional(),
  promptTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId } = await params

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { instruction, ops, beforeHash } = parsed.data

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const agent = await db.agent.findFirst({
    where: { id: agentId, userId: ownerId },
    select: { id: true, responseGuidelines: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const doc = agent.responseGuidelines ?? ""

  // Someone edited the prompt between propose and apply. Applying anyway would
  // silently discard their change.
  if (hashValue(doc) !== beforeHash) {
    return NextResponse.json(
      { error: "Your prompt changed since this edit was drafted. Re-run the instruction.", code: "STALE" },
      { status: 409 }
    )
  }

  const verified = verifyAndApplyEdits(doc, ops as EditOp[])
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message, code: verified.code }, { status: 422 })
  }

  try {
    await writeAgentPromptField(agentId, "responseGuidelines", verified.value)

    const oversized = doc.length > SNAPSHOT_MAX || verified.value.length > SNAPSHOT_MAX
    await db.promptEdit.create({
      data: {
        agentId,
        userId: session.user.id,
        field: "responseGuidelines",
        instruction,
        // Prisma Json needs a plain structure, not our interface type.
        ops: JSON.parse(JSON.stringify(verified.spans)),
        beforeValue: oversized ? null : doc,
        afterValue: oversized ? null : verified.value,
        beforeHash,
        afterHash: hashValue(verified.value),
        snapshotTruncated: oversized,
        model: parsed.data.model ?? "unknown",
        promptTokens: parsed.data.promptTokens ?? 0,
        outputTokens: parsed.data.outputTokens ?? 0,
      },
    })

    return NextResponse.json({ ok: true, value: verified.value })
  } catch (err) {
    console.error("[POST /api/agents/:id/prompt-edit/apply]", err)
    return NextResponse.json({ error: "Could not save that edit." }, { status: 500 })
  }
}
