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
  GiftIcon,
  CreditCardIcon,
  TagIcon,
  UsersIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./Sidebar.module.css"
import { cn } from "@/lib/utils"
import { useDashboardData } from "@/hooks/useDashboardData"
import { usePlanStats } from "@/hooks/usePlanStats"
import { PLAN_LABELS } from "@/lib/plans"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"

interface SidebarProps {
  userName: string
  businessName: string
  currentUserId: string
  currentWorkspaceId: string | null
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

const baseNavItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Squares2X2Icon },
  { href: "/dashboard/agents", label: "Agents", icon: CpuChipIcon },
  { href: "/dashboard/chats", label: "Conversations", icon: ChatBubbleLeftRightIcon },
  { href: "/dashboard/leads", label: "Leads", icon: FireIcon },
  { href: "/dashboard/team", label: "Team", icon: UsersIcon },
  { href: "/dashboard/channels/whatsapp-web", label: "Channels", icon: DevicePhoneMobileIcon },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCardIcon },
]

const referralNavItem: NavItem = { href: "/dashboard/referrals", label: "Referrals", icon: GiftIcon }

export function Sidebar({ userName, businessName, currentUserId, currentWorkspaceId, isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { data } = useDashboardData()
  const { data: stats } = usePlanStats()
  const navItems = data?.user?.referralsEnabled
    ? [...baseNavItems, referralNavItem]
    : baseNavItems

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

        {!collapsed && stats && (() => {
          const plan = stats.plan ?? "free"
          const planLabel = PLAN_LABELS[plan] ?? plan
          const used = stats.monthlyCreditsUsed ?? 0
          const limit = stats.creditLimit ?? 0
          const unlimited = limit === -1
          const pct = unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
          const remaining = unlimited ? null : Math.max(0, limit - used)
          const isWarning = !unlimited && pct >= 75
          const isDanger = !unlimited && pct >= 90
          return (
            <Link href="/dashboard/billing" className={styles.usageMini} onClick={onClose}>
              <div className={styles.usageMiniHeader}>
                <span className={`${styles.usageMiniPlanDot} ${isDanger ? styles.dotDanger : isWarning ? styles.dotWarning : styles.dotOk}`} />
                <span className={styles.usageMiniPlan}>{planLabel}</span>
                <span className={`${styles.usageMiniPct} ${isDanger ? styles.textDanger : isWarning ? styles.textWarning : ""}`}>
                  {unlimited ? "∞" : `${pct}%`}
                </span>
              </div>
              {!unlimited && (
                <div className={styles.usageMiniTrack}>
                  <div
                    className={`${styles.usageMiniFill} ${isDanger ? styles.fillDanger : isWarning ? styles.fillWarning : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              <div className={styles.usageMiniFooter}>
                <span className={styles.usageMiniUsed}>{used.toLocaleString()} cr used</span>
                {remaining !== null && (
                  <span className={`${styles.usageMiniRem} ${isDanger ? styles.textDanger : isWarning ? styles.textWarning : ""}`}>
                    {remaining.toLocaleString()} left
                  </span>
                )}
              </div>
            </Link>
          )
        })()}

        {!collapsed && (
          <WorkspaceSwitcher
            currentUserId={currentUserId}
            currentWorkspaceId={currentWorkspaceId}
            businessName={businessName}
          />
        )}

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
