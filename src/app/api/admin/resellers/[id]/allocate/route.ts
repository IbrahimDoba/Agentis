import { withAdmin } from "@/lib/api/withAuth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

interface Params { params: Promise<{ id: string }> }

// Top up (or deduct from) a reseller's credit pool. ADMIN only. `credits` may be
// negative to claw back, but the pool can't go below 0.
export const POST = withAdmin(async (req: NextRequest, { params }: Params) => {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const credits = Math.floor(Number(body?.credits))
  if (!Number.isFinite(credits) || credits === 0) {
    return NextResponse.json({ error: "Enter a non-zero credit amount" }, { status: 400 })
  }

  const reseller = await db.reseller.findUnique({ where: { id }, select: { creditPool: true, creditPoolTotal: true } })
  if (!reseller) return NextResponse.json({ error: "Reseller not found" }, { status: 404 })

  const newPool = reseller.creditPool + credits
  if (newPool < 0) return NextResponse.json({ error: "Pool can't go below zero" }, { status: 400 })

  // creditPoolTotal tracks lifetime allocation — only ever increases on top-ups.
  const updated = await db.reseller.update({
    where: { id },
    data: {
      creditPool: newPool,
      ...(credits > 0 ? { creditPoolTotal: reseller.creditPoolTotal + credits } : {}),
    },
    select: { creditPool: true, creditPoolTotal: true },
  })

  return NextResponse.json({ ok: true, ...updated })
})
