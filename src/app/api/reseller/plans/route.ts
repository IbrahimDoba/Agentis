import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

// The reseller's own plans — any name, price, credit allowance, duration.
export async function GET() {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const plans = await db.resellerPlan.findMany({
    where: { resellerId: ctx.resellerId },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  })
  return NextResponse.json({ plans })
}

export async function POST(req: NextRequest) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const priceNaira = Math.floor(Number(body?.priceNaira))
  const credits = Math.floor(Number(body?.credits))
  const durationDays = Math.floor(Number(body?.durationDays))

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (!Number.isFinite(priceNaira) || priceNaira < 0) return NextResponse.json({ error: "Invalid price" }, { status: 400 })
  if (!Number.isFinite(credits) || credits <= 0) return NextResponse.json({ error: "Credits must be a positive number" }, { status: 400 })
  if (!Number.isFinite(durationDays) || durationDays <= 0) return NextResponse.json({ error: "Duration must be a positive number of days" }, { status: 400 })

  const plan = await db.resellerPlan.create({
    data: { resellerId: ctx.resellerId, name, priceNaira, credits, durationDays },
  })
  return NextResponse.json({ plan }, { status: 201 })
}
