"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./Sidebar.module.css"
import { cn } from "@/lib/utils"

interface SidebarProps {
  userName: string
  businessName: string
}

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "◈" },
  { href: "/dashboard/agent", label: "My Agent", icon: "🤖" },
  { href: "/dashboard/chats", label: "Conversations", icon: "💬" },
]

export function Sidebar({ userName, businessName }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.logo}>
        <LogoIcon size={30} />
        D-Zero AI
      </Link>

      <nav className={styles.nav}>
        <div className={styles.navLabel}>Dashboard</div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(styles.navLink, isActive(item.href) ? styles.active : undefined)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={styles.bottom}>
        <div className={styles.userCard}>
          <div className={styles.userName}>{userName}</div>
          <div className={styles.userBusiness}>{businessName}</div>
          <button
            className={styles.signOutBtn}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            ↩ Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
