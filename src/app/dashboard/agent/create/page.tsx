import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import styles from "./page.module.css"
import { CreateAgentFlow } from "@/components/dashboard/CreateAgentFlow"

export default async function CreateAgentPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Create Your AI Agent</h1>
        <p className={styles.subtitle}>
          Pick a template to get started quickly, or build your own from scratch.
        </p>
      </div>

      <CreateAgentFlow />
    </div>
  )
}
