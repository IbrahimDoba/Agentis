import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"
import styles from "./page.module.css"

export default async function SuspendedPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.status !== "SUSPENDED") redirect("/dashboard")

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <div className={styles.icon}>🚫</div>
        </div>

        <h1 className={styles.title}>Account Suspended</h1>
        <p className={styles.desc}>
          Your account has been temporarily suspended. You cannot access the platform at this time.
        </p>

        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Account</span>
            <span className={styles.infoValue}>{session.user.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Status</span>
            <span className={styles.statusBadge}>Suspended</span>
          </div>
        </div>

        <p className={styles.helpText}>
          If you believe this is a mistake or would like more information, please contact our
          support team and we will review your account.
        </p>

        <div className={styles.actions}>
          <a href="/contact" className={styles.contactBtn}>
            Contact Support
          </a>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button type="submit" className={styles.signOutBtn}>Sign Out</button>
          </form>
        </div>

        <div className={styles.contactInfo}>
          <span>or email us directly:</span>
          <a href="mailto:support@dailzero.com" className={styles.contactEmail}>support@dailzero.com</a>
        </div>
      </div>
    </div>
  )
}
