import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Squares2X2Icon, UsersIcon, CpuChipIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./layout.module.css"

const navItems = [
  { href: "/admin", label: "Overview", icon: <Squares2X2Icon width={16} height={16} /> },
  { href: "/admin/users", label: "Users", icon: <UsersIcon width={16} height={16} /> },
  { href: "/admin/agents", label: "Agents", icon: <CpuChipIcon width={16} height={16} /> },
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
          D-Zero AI
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
            <span className={styles.navIcon}><ArrowUturnLeftIcon width={16} height={16} /></span>
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
