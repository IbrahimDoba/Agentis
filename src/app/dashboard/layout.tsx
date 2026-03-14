import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/dashboard/Sidebar"
import styles from "./layout.module.css"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className={styles.layout}>
      <Sidebar
        userName={session.user.name ?? "User"}
        businessName={session.user.businessName ?? ""}
      />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
