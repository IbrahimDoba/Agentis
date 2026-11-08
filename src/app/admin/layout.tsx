import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogoIcon } from "@/components/landing/Logo"
import { ToastProvider } from "@/context/ToastContext"
import { AdminNav } from "@/components/admin/AdminNav"
import styles from "./layout.module.css"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return (
    <ToastProvider>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.logo}>
          <LogoIcon size={30} />
          D-Zero AI
          <span className={styles.adminBadge}>Admin</span>
        </Link>

        <AdminNav />
      </aside>

      <main className={styles.main}>
        {children}
      </main>
    </div>
    </ToastProvider>
  )
}
