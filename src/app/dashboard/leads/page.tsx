import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { LeadsClient } from "@/components/dashboard/LeadsClient"
import styles from "./page.module.css"

export default async function LeadsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Leads</h1>
          <p className={styles.subtitle}>
            High-intent conversations flagged by AI or manually — track and follow up.
          </p>
        </div>
      </div>
      <LeadsClient />
    </div>
  )
}
