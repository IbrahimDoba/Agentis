import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { rewardGranted, commissionEarned, status } = await req.json()

  const referral = await db.referral.update({
    where: { id },
    data: {
      ...(rewardGranted !== undefined ? { rewardGranted, status: rewardGranted ? "REWARDED" : undefined } : {}),
      ...(commissionEarned !== undefined ? { commissionEarned } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: {
      referrer: { select: { name: true, email: true } },
      referred: { select: { name: true, email: true, plan: true } },
    },
  })

  return NextResponse.json({ referral })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  await db.referral.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
