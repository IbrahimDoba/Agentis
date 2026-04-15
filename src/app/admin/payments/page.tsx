import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { AdminPaymentsTable } from "@/components/admin/AdminPaymentsTable"
import styles from "./page.module.css"

export default async function AdminPaymentsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const requests = await db.paymentRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, businessName: true, plan: true } },
    },
  })

  const pending = requests.filter((r) => r.status === "PENDING").length
  const paid    = requests.filter((r) => r.status === "PAID").length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Payment Requests</h1>
          <p className={styles.subtitle}>Review and approve incoming subscription upgrade requests.</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{requests.length}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: "#f59e0b" }}>{pending}</span>
            <span className={styles.statLabel}>Pending</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: "var(--accent)" }}>{paid}</span>
            <span className={styles.statLabel}>Approved</span>
          </div>
        </div>
      </div>

      <AdminPaymentsTable
        requests={requests.map((r) => ({
          id: r.id,
          reference: r.reference,
          plan: r.plan,
          amountNaira: r.amountNaira,
          status: r.status,
          notes: r.notes ?? null,
          createdAt: r.createdAt.toISOString(),
          user: r.user,
        }))}
      />
    </div>
  )
}
