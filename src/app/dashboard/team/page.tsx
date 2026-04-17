"use client"

import { usePlanStats } from "@/hooks/usePlanStats"
import { useDashboardData } from "@/hooks/useDashboardData"
import { TeamTab } from "@/components/dashboard/TeamTab"
import styles from "./page.module.css"

export default function TeamPage() {
  const { data: planStats } = usePlanStats()
  const { data } = useDashboardData()
  const isOwner = data?.isOwnWorkspace ?? true

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Team</h1>
        <p className={styles.subtitle}>
          {isOwner
            ? "Invite team members and manage roles in your workspace."
            : "View the team members of this workspace."}
        </p>
      </div>
      <TeamTab plan={planStats?.plan ?? "free"} isOwner={isOwner} />
    </div>
  )
}
