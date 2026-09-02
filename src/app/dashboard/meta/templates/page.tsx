import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { MetaTemplatesClient } from "@/components/dashboard/MetaTemplatesClient"
import styles from "../page.module.css"

export default async function MetaTemplatesPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { metaEnabled: true },
  })
  if (!user?.metaEnabled) redirect("/dashboard")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Link href="/dashboard/meta" className={styles.backLink}>
            ← Meta
          </Link>
          <h1 className={styles.title}>Message templates</h1>
          <p className={styles.subtitle}>
            Templates are how you message a customer outside the 24-hour window — after
            that, only an approved template can be sent. Meta reviews each one.
          </p>
        </div>
      </div>
      <MetaTemplatesClient />
    </div>
  )
}
