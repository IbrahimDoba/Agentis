import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { MetaChatPanel } from "@/components/dashboard/MetaChatPanel"
import { MetaAccountClient } from "@/components/dashboard/MetaAccountClient"
import styles from "./page.module.css"

export default async function MetaPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Meta</h1>
          <p className={styles.subtitle}>
            Your official WhatsApp Business Platform connection — account status, phone
            numbers, message templates, and the business portfolios you administer.
          </p>
        </div>
      </div>
      <MetaChatPanel />
      <MetaAccountClient />
    </div>
  )
}
