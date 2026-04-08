import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { UserTable } from "@/components/admin/UserTable"

export default async function AdminUsersPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { agents: true } },
    },
  })

  const usersPublic = (users as any[]).map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    businessName: u.businessName,
    role: u.role as any,
    status: u.status as any,
    createdAt: u.createdAt.toISOString(),
    businessCategory: u.businessCategory ?? null,
    businessDescription: u.businessDescription ?? null,
    businessAddress: u.businessAddress ?? null,
    businessEmail: u.businessEmail ?? null,
    businessWebsite: u.businessWebsite ?? null,
    maxAgents: u.maxAgents ?? 1,
    onboardingCompleted: u.onboardingCompleted ?? false,
    _count: u._count,
  }))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>{users.length} total users</p>
      </div>

      <UserTable users={usersPublic} />
    </div>
  )
}
