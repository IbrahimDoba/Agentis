import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ReferralDashboard } from "@/components/dashboard/ReferralDashboard"

export default async function ReferralsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  // Ensure referral code exists
  let user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, referralCode: true },
  })
  if (!user) redirect("/login")

  if (!user.referralCode) {
    const slug = user.name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
    let code = `${slug}-${Math.random().toString(36).slice(2, 8)}`
    let exists = await db.user.findUnique({ where: { referralCode: code } })
    while (exists) {
      code = `${slug}-${Math.random().toString(36).slice(2, 8)}`
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

  return (
    <ReferralDashboard
      referralCode={user.referralCode!}
      referrals={referrals.map((r) => ({
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
      }))}
      stats={{ totalEarned, totalPaid, pending: totalEarned - totalPaid, count: referrals.length }}
    />
  )
}
