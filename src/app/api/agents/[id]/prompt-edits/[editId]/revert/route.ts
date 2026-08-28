import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { writeAgentPromptField } from "@/lib/agentPromptWrite"
import { hashValue } from "@/lib/promptEdit"

// Roll an applied edit back. Restores the stored snapshot exactly rather than
// attempting an inverse splice, whose anchors rot as soon as anyone hand-edits
// the prompt.

interface Params { params: Promise<{ id: string; editId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId, editId } = await params

  const { ownerId, role } = await getWorkspaceContext(session.user.id)
  // Revert undoes work that may belong to a teammate, so it is owner/admin only.
  if (role === "MEMBER") {
    return NextResponse.json({ error: "Only the workspace owner can undo an edit." }, { status: 403 })
  }

  const agent = await db.agent.findFirst({
    where: { id: agentId, userId: ownerId },
    select: { id: true, responseGuidelines: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const edit = await db.promptEdit.findFirst({ where: { id: editId, agentId } })
  if (!edit) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (edit.revertedAt) {
    return NextResponse.json({ error: "That edit was already undone." }, { status: 409 })
  }
  if (edit.snapshotTruncated || edit.beforeValue === null) {
    return NextResponse.json(
      { error: "This prompt was too large to snapshot, so it cannot be rolled back automatically." },
      { status: 422 }
    )
  }

  const current = agent.responseGuidelines ?? ""
  // The prompt moved on since this edit; restoring would discard newer work.
  if (hashValue(current) !== edit.afterHash) {
    return NextResponse.json(
      { error: "The prompt has changed since this edit. Undo is no longer safe.", code: "DRIFTED" },
      { status: 409 }
    )
  }

  try {
    await writeAgentPromptField(agentId, "responseGuidelines", edit.beforeValue)
    await db.promptEdit.update({
      where: { id: editId },
      data: { revertedAt: new Date(), revertedBy: session.user.id },
    })
    return NextResponse.json({ ok: true, value: edit.beforeValue })
  } catch (err) {
    console.error("[POST /api/agents/:id/prompt-edits/:editId/revert]", err)
    return NextResponse.json({ error: "Could not undo that edit." }, { status: 500 })
  }
}
