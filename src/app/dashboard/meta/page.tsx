import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { MetaAccountsClient } from "@/components/dashboard/MetaAccountsClient"
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

  // Read here rather than in the client component: NEXT_PUBLIC_* is inlined at
  // build time and the production image is built without these, so they must
  // reach the browser as props from a server render instead. The NEXT_PUBLIC_
  // names are accepted as a fallback for environments that already set them.
  const metaAppId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || null
  const metaConfigId =
    process.env.META_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || null

  return (
    <div className={styles.page}>
      <MetaAccountsClient appId={metaAppId} configId={metaConfigId} />
    </div>
  )
}
