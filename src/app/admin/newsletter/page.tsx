import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { NewsletterComposer } from "@/components/admin/NewsletterComposer"
import styles from "./page.module.css"

export default async function AdminNewsletterPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const [subscriberCount, userCount, recentSubs] = await Promise.all([
    db.newsletterSubscriber.count(),
    db.user.count({ where: { status: "APPROVED" } }),
    db.newsletterSubscriber.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { email: true, name: true, createdAt: true, source: true },
    }),
  ])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Newsletter</h1>
          <p className={styles.subtitle}>Compose and send emails to your subscribers and users</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{subscriberCount}</span>
            <span className={styles.statLabel}>Subscribers</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{userCount}</span>
            <span className={styles.statLabel}>Active Users</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{subscriberCount + userCount}</span>
            <span className={styles.statLabel}>Max Reach</span>
          </div>
        </div>
      </div>

      <NewsletterComposer
        subscriberCount={subscriberCount}
        userCount={userCount}
        recentSubs={recentSubs.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
      />
    </div>
  )
}
