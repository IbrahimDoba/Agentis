import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"
import { PlanSchema, describePlan } from "@/lib/status-autopilot"
import { interpretInstructions } from "@/lib/status-autopilot-ai"
import { dryRun, loadCandidates, summarize } from "@/lib/status-autopilot-planner"

interface Params {
  params: Promise<{ id: string }>
}

const Schema = z.object({
  instructions: z.string().trim().min(3, "Tell Autopilot how you want it to post").max(1000),
  // Change the saved plan instead of starting a new one.
  fromCurrent: z.boolean().optional(),
})

// The owner's own words → a plan to check. Nothing is saved here.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const current = parsed.data.fromCurrent ? await db.statusAutopilot.findUnique({ where: { agentId: id }, select: { plan: true } }) : null
    const currentPlan = current ? PlanSchema.safeParse(current.plan) : null
    const { candidates } = await loadCandidates(id)

    const result = await interpretInstructions({
      instructions: parsed.data.instructions,
      gallery: summarize(candidates),
      currentPlan: currentPlan?.success ? currentPlan.data : null,
    })
    const preview = result.plan.slots.length ? await dryRun(id, result.plan) : null
    return NextResponse.json({
      ...result,
      lines: describePlan(result.plan),
      preview: preview && { warnings: preview.warnings, weekCredits: preview.weekCredits, posts: preview.posts },
    })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-autopilot/interpret]", error)
    return NextResponse.json({ error: "Couldn't make a plan from that. Try again, or pick a preset." }, { status: 500 })
  }
}
