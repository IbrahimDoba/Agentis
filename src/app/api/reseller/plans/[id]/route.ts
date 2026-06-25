import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

interface Params { params: Promise<{ id: string }> }

// Edit a plan (incl. activate/deactivate). Scoped via updateMany resellerId.
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: { name?: string; priceNaira?: number; credits?: number; durationDays?: number; active?: boolean } = {}

  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (body?.priceNaira !== undefined) {
    const n = Math.floor(Number(body.priceNaira))
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Invalid price" }, { status: 400 })
    data.priceNaira = n
  }
  if (body?.credits !== undefined) {
    const n = Math.floor(Number(body.credits))
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "Invalid credits" }, { status: 400 })
    data.credits = n
  }
  if (body?.durationDays !== undefined) {
    const n = Math.floor(Number(body.durationDays))
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "Invalid duration" }, { status: 400 })
    data.durationDays = n
  }
  if (typeof body?.active === "boolean") data.active = body.active

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const res = await db.resellerPlan.updateMany({ where: { id, resellerId: ctx.resellerId }, data })
  if (res.count === 0) return NextResponse.json({ error: "Plan not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// Delete a plan (scoped). Existing activations already granted credits, so
// removing a plan only stops it being assignable going forward.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const res = await db.resellerPlan.deleteMany({ where: { id, resellerId: ctx.resellerId } })
  if (res.count === 0) return NextResponse.json({ error: "Plan not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
