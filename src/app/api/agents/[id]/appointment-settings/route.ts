import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"

// Toggle whether an agent's AI may book appointments (the schedule_appointment
// tool). Scoped to the active workspace owner so a stale/other-tenant agent id
// touches 0 rows. Manual appointment creation is unaffected by this flag.

interface Params { params: Promise<{ id: string }> }

const patchSchema = z.object({ enabled: z.boolean() })

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  // Guarded update — scoped to the owner's agent so it can't flip another
  // tenant's flag; count === 0 means the agent isn't in this workspace.
  const res = await db.agent.updateMany({
    where: { id, userId: ownerId },
    data: { appointmentSchedulingEnabled: parsed.data.enabled },
  })
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ appointmentSchedulingEnabled: parsed.data.enabled })
}
