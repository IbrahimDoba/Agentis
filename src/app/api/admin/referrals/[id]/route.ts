import { withAdmin } from "@/lib/api/withAuth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

interface Params { params: Promise<{ id: string }> }

export const PATCH = withAdmin(async (req: NextRequest, { params }: Params) => {
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
})

export const DELETE = withAdmin(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params
  await db.referral.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
