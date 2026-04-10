import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { AdminReferralTable } from "@/components/admin/AdminReferralTable"
import styles from "./page.module.css"

export default async function AdminReferralsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const referrals = await db.referral.findMany({
    include: {
      referrer: { select: { id: true, name: true, email: true } },
      referred: { select: { id: true, name: true, email: true, plan: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // All approved users for the "assign referrer" search
  const users = await db.user.findMany({
    where: { status: "APPROVED" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })

  const totalOwed = referrals
    .filter((r) => r.status === "COMPLETED" && !r.rewardGranted)
    .reduce((s, r) => s + (r.commissionEarned ?? 0), 0)

  const totalPaid = referrals
    .filter((r) => r.rewardGranted)
    .reduce((s, r) => s + (r.commissionEarned ?? 0), 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Referrals</h1>
          <p className={styles.subtitle}>Track referrals, manage commissions, and assign referrers manually</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{referrals.length}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: "var(--accent)" }}>
              ₦{totalOwed.toLocaleString()}
            </span>
            <span className={styles.statLabel}>Owed</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: "var(--teal)" }}>
              ₦{totalPaid.toLocaleString()}
            </span>
            <span className={styles.statLabel}>Paid Out</span>
          </div>
        </div>
      </div>

      <AdminReferralTable
        referrals={referrals.map((r) => ({
          id: r.id,
          referrer: r.referrer,
          referred: { ...r.referred, plan: r.referred.plan },
          code: r.code,
          status: r.status,
          commissionEarned: r.commissionEarned,
          rewardGranted: r.rewardGranted,
          assignedByAdmin: r.assignedByAdmin,
          createdAt: r.createdAt.toISOString(),
        }))}
        users={users}
      />
    </div>
  )
}
