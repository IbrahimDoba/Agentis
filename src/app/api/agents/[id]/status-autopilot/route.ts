import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"
import { AUTOPILOT_PRESETS, PlanSchema, describePlan, normalizePlan, suggestPlan } from "@/lib/status-autopilot"
import { dryRun, listUpcoming, loadCandidates, planAutopilot, summarize, topUpIfShort } from "@/lib/status-autopilot-planner"

interface Params {
  params: Promise<{ id: string }>
}

const SaveSchema = z.object({
  plan: PlanSchema,
  mode: z.string().regex(/^(suggested|custom|preset:[a-z-]+)$/),
  instructions: z.string().trim().max(1000).nullable().optional(),
  enabled: z.boolean(),
})

const ToggleSchema = z.object({ enabled: z.boolean() })

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    let ap = await db.statusAutopilot.findUnique({ where: { agentId: id } })
    if (ap?.enabled && !ap.pausedReason) {
      await topUpIfShort(id)
      // The top-up may have paused it.
      ap = await db.statusAutopilot.findUnique({ where: { agentId: id } })
    }

    const { candidates } = await loadCandidates(id)
    const suggested = suggestPlan(candidates)
    const saved = ap ? PlanSchema.safeParse(ap.plan) : null
    const preview = await dryRun(id, saved?.success ? saved.data : suggested)

    return NextResponse.json({
      autopilot: ap && saved?.success
        ? {
          enabled: ap.enabled,
          pausedReason: ap.pausedReason,
          mode: ap.mode,
          instructions: ap.instructions,
          plan: saved.data,
          lines: describePlan(saved.data),
        }
        : null,
      gallery: summarize(candidates),
      suggested: { plan: suggested, lines: describePlan(suggested) },
      presets: AUTOPILOT_PRESETS.map((p) => ({ ...p, lines: describePlan(p.plan) })),
      preview: { warnings: preview.warnings, weekCredits: preview.weekCredits },
      upcoming: ap ? await listUpcoming(id) : [],
    })
  } catch (error) {
    console.error("[GET /api/agents/:id/status-autopilot]", error)
    return NextResponse.json({ error: "Failed to load Autopilot" }, { status: 500 })
  }
}

// Save the plan (and turn it on or leave it off). Upcoming Autopilot posts are
// planned again from scratch.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid plan", details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status", spending: body.enabled })
    if ("error" in access) return access.error

    const { plan, dropped } = normalizePlan(body.plan)
    if (plan.slots.length === 0) return NextResponse.json({ error: "Add at least one posting time" }, { status: 400 })

    const fields = {
      plan,
      mode: body.mode,
      instructions: body.instructions || null,
      enabled: body.enabled,
      ...(body.enabled ? { pausedReason: null, resumedAt: new Date() } : {}),
    }
    await db.statusAutopilot.upsert({ where: { agentId: id }, create: { agentId: id, ...fields }, update: fields })
    const result = await planAutopilot(id, { replan: true })
    return NextResponse.json({ ok: true, dropped, created: result.created, paused: result.paused ?? null })
  } catch (error) {
    console.error("[PUT /api/agents/:id/status-autopilot]", error)
    return NextResponse.json({ error: "Failed to save Autopilot" }, { status: 500 })
  }
}

// Turn on, off, or back on after a pause.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = ToggleSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { enabled } = parsed.data

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status", spending: enabled })
    if ("error" in access) return access.error

    const { count } = await db.statusAutopilot.updateMany({
      where: { agentId: id },
      data: enabled ? { enabled: true, pausedReason: null, resumedAt: new Date() } : { enabled: false },
    })
    if (count === 0) return NextResponse.json({ error: "Set up a plan first" }, { status: 404 })
    const result = await planAutopilot(id, { replan: true })
    return NextResponse.json({ ok: true, created: result.created, paused: result.paused ?? null })
  } catch (error) {
    console.error("[PATCH /api/agents/:id/status-autopilot]", error)
    return NextResponse.json({ error: "Failed to update Autopilot" }, { status: 500 })
  }
}
