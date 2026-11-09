import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { assertContactsAccess } from "@/lib/contacts-access"
import { PlanSchema, describePlan } from "@/lib/status-autopilot"
import { dryRun } from "@/lib/status-autopilot-planner"

interface Params {
  params: Promise<{ id: string }>
}

const Schema = z.object({ plan: PlanSchema })

// What a draft plan would post over the next week. Nothing is saved.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid plan" }, { status: 400 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const result = await dryRun(id, parsed.data.plan)
    return NextResponse.json({ ...result, lines: describePlan(result.plan) })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-autopilot/preview]", error)
    return NextResponse.json({ error: "Failed to preview the plan" }, { status: 500 })
  }
}
