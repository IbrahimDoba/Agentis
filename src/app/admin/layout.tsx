import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./layout.module.css"

const navItems = [
  { href: "/admin", label: "Overview", icon: "◈" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/agents", label: "Agents", icon: "🤖" },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.logo}>
          <LogoIcon size={30} />
          Agentis
          <span className={styles.adminBadge}>Admin</span>
        </Link>

        <nav className={styles.nav}>
          <div className={styles.navLabel}>Administration</div>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          <div className={styles.navLabel}>Account</div>
          <Link href="/dashboard" className={styles.navLink}>
            <span className={styles.navIcon}>↩</span>
            Back to Dashboard
          </Link>
        </nav>
      </aside>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
