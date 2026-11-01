import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { baileysClient } from "@/lib/baileys-client"
import { assertContactsAccess } from "@/lib/contacts-access"

interface Params {
  params: Promise<{ id: string; runId: string }>
}

const schema = z.object({ action: z.enum(["pause", "resume", "cancel"]) })

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
  const { action } = parsed.data

  try {
    const { id, runId } = await params
    // Resuming spends credits again; pausing or cancelling must always be allowed.
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { spending: action === "resume" })
    if ("error" in access) return access.error

    const res = await baileysClient.contactSaveRunAction(id, runId, action)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json(res.data)
  } catch (error) {
    console.error("[POST /api/agents/:id/status-contacts/runs/:runId]", error)
    return NextResponse.json({ error: "Failed to update the save run" }, { status: 502 })
  }
}
