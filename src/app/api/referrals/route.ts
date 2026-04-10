import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

function generateReferralCode(name: string): string {
  const slug = name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${slug}-${rand}`
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Ensure user has a referral code
  let user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, referralCode: true },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!user.referralCode) {
    let code = generateReferralCode(user.name)
    // Ensure uniqueness
    let exists = await db.user.findUnique({ where: { referralCode: code } })
    while (exists) {
      code = generateReferralCode(user.name)
      exists = await db.user.findUnique({ where: { referralCode: code } })
    }
    user = await db.user.update({
      where: { id: user.id },
      data: { referralCode: code },
      select: { id: true, name: true, referralCode: true },
    })
  }

  const referrals = await db.referral.findMany({
    where: { referrerId: session.user.id },
    include: { referred: { select: { name: true, email: true, plan: true, status: true } } },
    orderBy: { createdAt: "desc" },
  })

  const totalEarned = referrals.reduce((s, r) => s + (r.commissionEarned ?? 0), 0)
  const totalPaid = referrals.filter((r) => r.rewardGranted).reduce((s, r) => s + (r.commissionEarned ?? 0), 0)
  const pending = totalEarned - totalPaid

  return NextResponse.json({
    referralCode: user.referralCode,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referred.name,
      referredEmail: r.referred.email,
      referredPlan: r.referred.plan,
      referredStatus: r.referred.status,
      status: r.status,
      commissionEarned: r.commissionEarned,
      rewardGranted: r.rewardGranted,
      assignedByAdmin: r.assignedByAdmin,
      createdAt: r.createdAt.toISOString(),
    })),
    stats: { totalEarned, totalPaid, pending, count: referrals.length },
  })
}
