import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import styles from "./page.module.css"
import Button from "@/components/ui/Button"
import Link from "next/link"

export default async function PendingPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.status === "APPROVED") redirect("/dashboard")

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>⏳</div>
        <h1 className={styles.title}>Account Under Review</h1>
        <p className={styles.desc}>
          Thank you for signing up! Your account is currently being reviewed by our team.
          This usually takes less than 24 hours.
        </p>

        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepIconDone}>✓</div>
            <div>
              <div className={styles.stepTitle}>Account Created</div>
              <div className={styles.stepDesc}>Your account has been created successfully</div>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepIconPending}>2</div>
            <div>
              <div className={styles.stepTitle}>Under Review</div>
              <div className={styles.stepDesc}>Our team is reviewing your application</div>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepIconFuture}>3</div>
            <div>
              <div className={styles.stepTitle}>Ready to Go</div>
              <div className={styles.stepDesc}>Create your AI agent and go live</div>
            </div>
          </div>
        </div>

        <p className={styles.note}>
          We&apos;ll send a confirmation email to your registered address once approved.
          Have questions? Contact us at{" "}
          <a href="mailto:support@dailzero.com" className={styles.emailLink}>
            support@dailzero.com
          </a>
        </p>

        <form action="/api/auth/signout" method="post">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign out</Button>
          </Link>
        </form>
      </div>
    </div>
  )
}
