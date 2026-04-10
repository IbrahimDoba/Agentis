import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const referrals = await db.referral.findMany({
    include: {
      referrer: { select: { id: true, name: true, email: true } },
      referred: { select: { id: true, name: true, email: true, plan: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const totalOwed = referrals
    .filter((r) => r.status === "COMPLETED" && !r.rewardGranted)
    .reduce((s, r) => s + (r.commissionEarned ?? 0), 0)

  return NextResponse.json({
    referrals: referrals.map((r) => ({
      id: r.id,
      referrer: r.referrer,
      referred: r.referred,
      code: r.code,
      status: r.status,
      commissionEarned: r.commissionEarned,
      commissionRate: r.commissionRate,
      rewardGranted: r.rewardGranted,
      assignedByAdmin: r.assignedByAdmin,
      createdAt: r.createdAt.toISOString(),
    })),
    totalOwed,
  })
}

// Assign a referrer to a user manually
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { referrerId, referredId, commissionEarned } = await req.json()
  if (!referrerId || !referredId) return NextResponse.json({ error: "referrerId and referredId required" }, { status: 400 })
  if (referrerId === referredId) return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 })

  // Check if referred user already has a referral
  const existing = await db.referral.findUnique({ where: { referredId } })
  if (existing) return NextResponse.json({ error: "This user already has a referral assigned" }, { status: 409 })

  const referral = await db.referral.create({
    data: {
      referrerId,
      referredId,
      assignedByAdmin: true,
      commissionEarned: commissionEarned ?? null,
    },
    include: {
      referrer: { select: { name: true, email: true } },
      referred: { select: { name: true, email: true, plan: true } },
    },
  })

  return NextResponse.json({ referral })
}
