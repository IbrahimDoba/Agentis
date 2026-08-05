import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { AppointmentsClient } from "@/components/dashboard/AppointmentsClient"
import styles from "./page.module.css"

export default async function AppointmentsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const { ownerId } = await getWorkspaceContext(session.user.id)

  // Agent picker for the manual "New appointment" form + the account's default
  // reminder lead times. Serialized to a plain DTO for the client component.
  const [agents, owner] = await Promise.all([
    db.agent.findMany({
      where: { userId: ownerId },
      select: { id: true, businessName: true, appointmentSchedulingEnabled: true },
      orderBy: { createdAt: "asc" },
    }),
    db.user.findUnique({
      where: { id: ownerId },
      select: { appointmentReminder1Minutes: true, appointmentReminder2Minutes: true },
    }),
  ])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Appointments</h1>
        <p className={styles.subtitle}>
          Meetings, inspections and calls the AI or your team booked — you and your team get an email reminder before each one.
        </p>
      </div>
      <AppointmentsClient
        agents={agents}
        defaultReminder1={owner?.appointmentReminder1Minutes ?? 60}
        defaultReminder2={owner?.appointmentReminder2Minutes ?? null}
      />
    </div>
  )
}
