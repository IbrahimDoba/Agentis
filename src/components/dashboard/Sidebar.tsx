"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Squares2X2Icon,
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
  FireIcon,
  UserIcon,
  SparklesIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./Sidebar.module.css"
import { cn } from "@/lib/utils"

interface SidebarProps {
  userName: string
  businessName: string
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Squares2X2Icon },
  { href: "/dashboard/agents", label: "Agents", icon: CpuChipIcon },
  { href: "/dashboard/chats", label: "Conversations", icon: ChatBubbleLeftRightIcon },
  { href: "/dashboard/leads", label: "Leads", icon: FireIcon },
]

export function Sidebar({ userName, businessName, isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed, isOpen ? styles.open : undefined)}>
      <div className={styles.logoRow}>
        <Link
          href="/dashboard"
          className={styles.logo}
          onClick={onClose}
          title={collapsed ? "D-Zero AI" : undefined}
        >
          <LogoIcon size={30} />
          {!collapsed && <span>D-Zero AI</span>}
        </Link>
        {/* Collapse toggle — desktop only */}
        {onToggleCollapse && (
          <button
            className={styles.collapseBtn}
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <ChevronRightIcon width={14} height={14} />
              : <ChevronLeftIcon width={14} height={14} />
            }
          </button>
        )}
        {/* Close button — mobile only */}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close menu">
          <XMarkIcon width={16} height={16} />
        </button>
      </div>

      <nav className={styles.nav}>
        {!collapsed && <div className={styles.navLabel}>Dashboard</div>}
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.href} className={styles.navItemWrap}>
              <Link
                href={item.href}
                className={cn(styles.navLink, isActive(item.href) ? styles.active : undefined)}
                onClick={onClose}
              >
                <span className={styles.navIcon}>
                  <Icon width={16} height={16} />
                </span>
                {!collapsed && item.label}
              </Link>
              {collapsed && <span className={styles.tooltip}>{item.label}</span>}
            </div>
          )
        })}
      </nav>

      <div className={styles.bottom}>
        {/* Profile — above What's New */}
        <div className={styles.navItemWrap}>
          <Link
            href="/dashboard/profile"
            className={cn(styles.navLink, isActive("/dashboard/profile") ? styles.active : undefined)}
            onClick={onClose}
          >
            <span className={styles.navIcon}>
              <UserIcon width={16} height={16} />
            </span>
            {!collapsed && "Profile"}
          </Link>
          {collapsed && <span className={styles.tooltip}>Profile</span>}
        </div>

        <div className={styles.navItemWrap}>
          <Link
            href="/changelog"
            className={styles.whatsNewLink}
            onClick={onClose}
          >
            <span className={styles.navIcon}>
              <SparklesIcon width={16} height={16} />
            </span>
            {!collapsed && <span>What&apos;s New</span>}
          </Link>
          {collapsed && <span className={styles.tooltip}>What&apos;s New</span>}
        </div>

        {!collapsed && (
          <div className={styles.userCard}>
            <div className={styles.userName}>{userName}</div>
            <div className={styles.userBusiness}>{businessName}</div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
