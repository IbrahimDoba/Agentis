import { NextRequest, NextResponse } from "next/server"
import { getResellerAdminContext } from "@/lib/resellerAdmin"
import { activateResellerPlan } from "@/lib/resellerBilling"

interface Params { params: Promise<{ id: string }> }

// Manually activate a plan for a user (the reseller collected payment offline).
// Debits the reseller's pool and grants the user credits. Tenant-scoped inside
// activateResellerPlan — the user must belong to this reseller.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const planId = typeof body?.planId === "string" ? body.planId : ""
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 })

  const result = await activateResellerPlan({ resellerId: ctx.resellerId, userId: id, planId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
