import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import styles from "./page.module.css"
import { AgentForm } from "@/components/dashboard/AgentForm"

export default async function CreateAgentPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Create Your AI Agent</h1>
        <p className={styles.subtitle}>
          Fill in your business details to set up your WhatsApp AI agent.
          The more detail you provide, the better your agent will perform.
        </p>
      </div>

      <AgentForm />
    </div>
  )
}
