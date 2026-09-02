import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { MetaConnectPanel } from "@/components/dashboard/MetaConnectPanel"
import { MetaChatPanel } from "@/components/dashboard/MetaChatPanel"
import { MetaAccountClient } from "@/components/dashboard/MetaAccountClient"
import Link from "next/link"
import styles from "./page.module.css"

export default async function MetaPage() {
  const session = await auth()
  if (!session) redirect("/login")

  // Hiding the nav item isn't a guard — the route has to enforce it too, or
  // anyone can reach the page by typing the URL.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { metaEnabled: true },
  })
  if (!user?.metaEnabled) redirect("/dashboard")

  // Shown prominently because the number is the entry point: without it you
  // can't message the agent, and it isn't discoverable anywhere else.
  const displayNumber = process.env.META_TEST_DISPLAY_NUMBER || null

  // Read here rather than in the client component: NEXT_PUBLIC_* is inlined at
  // build time and the production image is built without these, so they must
  // reach the browser as props from a server render instead. The NEXT_PUBLIC_
  // names are accepted as a fallback for environments that already set them.
  const metaAppId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || null
  const metaConfigId =
    process.env.META_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Meta</h1>
          <p className={styles.subtitle}>
            Your official WhatsApp Business Platform connection — account status, phone
            numbers, and approved message templates.
          </p>
        </div>
      </div>

      {displayNumber && (
        <div className={styles.numberBanner}>
          <span className={styles.numberLabel}>Message your AI agent on WhatsApp</span>
          <strong className={styles.number}>{displayNumber}</strong>
          <span className={styles.numberHint}>
            Send a message to this number and the AI replies below in real time.
          </span>
        </div>
      )}

      <div className={styles.quickLinks}>
        <Link href="/dashboard/meta/templates" className={styles.quickLink}>
          Message templates →
        </Link>
      </div>

      <MetaConnectPanel appId={metaAppId} configId={metaConfigId} />
      <MetaChatPanel />
      <MetaAccountClient />
    </div>
  )
}
