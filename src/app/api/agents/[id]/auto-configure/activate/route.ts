import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { activateAutoConfigDraft, type AutoConfigDraft } from "@/lib/agent-auto-config"

interface Params {
  params: Promise<{ id: string }>
}

// POST — apply the (possibly edited) draft to the live Agent row. Called
// from /onboarding/review when the user clicks "Activate my AI agent".
// Accepts an optional `draft` body so any inline edits the user made
// before activating are persisted; if no body is sent, we activate the
// already-saved Agent.autoConfigDraft as-is.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const agent = await db.agent.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, autoConfigStatus: true, autoConfigDraft: true },
  })
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { draft?: AutoConfigDraft } | null

  if (body?.draft) {
    // Persist the edited draft before activating so the activation step
    // picks up the operator's tweaks.
    await db.agent.update({
      where: { id },
      data: { autoConfigDraft: body.draft as unknown as object },
    })
  } else if (!agent.autoConfigDraft) {
    return NextResponse.json({ error: "No draft to activate" }, { status: 400 })
  }

  try {
    await activateAutoConfigDraft(id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
