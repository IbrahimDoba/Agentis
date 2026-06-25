import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

interface Params { params: Promise<{ id: string }> }

const ALLOWED_STATUS = ["APPROVED", "SUSPENDED", "REJECTED", "PENDING"] as const
type AllowedStatus = (typeof ALLOWED_STATUS)[number]

// Approve / suspend / reject one of the reseller's own users. The updateMany
// `where` includes resellerId, so a stale/foreign id simply affects 0 rows —
// a reseller admin can never touch another tenant's user.
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const status = body?.status as AllowedStatus
  if (!ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const res = await db.user.updateMany({
    where: { id, resellerId: ctx.resellerId },
    data: { status },
  })
  if (res.count === 0) return NextResponse.json({ error: "User not found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
