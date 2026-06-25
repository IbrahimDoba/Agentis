"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Squares2X2Icon,
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
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
  MegaphoneIcon,
  BookOpenIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline"
import { cn } from "@/lib/utils"
import { useDashboardData } from "@/hooks/useDashboardData"
import { useBrand } from "@/components/BrandProvider"
import { usePlanStats } from "@/hooks/usePlanStats"
import { PLAN_LABELS } from "@/lib/plans"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"
import styles from "./Sidebar.module.css"

const AVATAR_COLORS = [
  "#16a34a", "#2563eb", "#7c3aed", "#dc2626",
  "#ea580c", "#0891b2", "#db2777", "#b45309",
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function BusinessAvatar({ name, size }: { name: string; size: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?"
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 7,
        background: getAvatarColor(name),
        color: "#fff",
        fontSize: size <= 24 ? 10 : 12,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  )
}

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
  { href: "/dashboard/broadcasts", label: "Broadcasts", icon: MegaphoneIcon },
  { href: "/dashboard/team", label: "Team", icon: UsersIcon },
  { href: "/dashboard/channels/whatsapp-web", label: "Channels", icon: DevicePhoneMobileIcon },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCardIcon },
]

const referralNavItem: NavItem = { href: "/dashboard/referrals", label: "Referrals", icon: GiftIcon }

export function Sidebar({ userName, businessName, currentUserId, currentWorkspaceId, isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { data } = useDashboardData()
  const brand = useBrand()
  const { data: stats } = usePlanStats()
  // Reseller-tenant users keep the Billing entry — but it's a read-only
  // plan/credits view (the page + the payment APIs block self-pay).
  const isResellerAdmin = data?.user?.role === "RESELLER_ADMIN"
  const navItems = data?.user?.referralsEnabled
    ? [...baseNavItems, referralNavItem]
    : [...baseNavItems]

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
          title={collapsed ? businessName : undefined}
        >
          <BusinessAvatar name={businessName || "B"} size={30} />
          {!collapsed && <span className={styles.logoName}>{businessName}</span>}
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
            href="/dashboard/guide"
            className={cn(styles.navLink, isActive("/dashboard/guide") ? styles.active : undefined)}
            onClick={onClose}
          >
            <span className={styles.navIcon}>
              <BookOpenIcon width={16} height={16} />
            </span>
            {!collapsed && "Guide"}
          </Link>
          {collapsed && <span className={styles.tooltip}>Guide</span>}
        </div>

        {isResellerAdmin && (
          <div className={styles.navItemWrap}>
            <Link
              href="/reseller"
              className={cn(styles.navLink, isActive("/reseller") ? styles.active : undefined)}
              onClick={onClose}
            >
              <span className={styles.navIcon}>
                <UsersIcon width={16} height={16} />
              </span>
              {!collapsed && "Reseller admin"}
            </Link>
            {collapsed && <span className={styles.tooltip}>Reseller admin</span>}
          </div>
        )}

        {data?.user?.developerModeEnabled && (
          <div className={styles.navItemWrap}>
            <Link
              href="/dashboard/developer"
              className={cn(styles.navLink, isActive("/dashboard/developer") ? styles.active : undefined)}
              onClick={onClose}
            >
              <span className={styles.navIcon}>
                <CodeBracketIcon width={16} height={16} />
              </span>
              {!collapsed && "Developer"}
            </Link>
            {collapsed && <span className={styles.tooltip}>Developer</span>}
          </div>
        )}

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
          // Reseller-tenant users run on a pool-granted wallet — show that
          // balance + validity instead of plan-allowance usage.
          if (stats.isReseller) {
            const credits = stats.creditBalance ?? 0
            const exp = stats.creditsExpireAt ?? stats.subscriptionExpiresAt
            const expDate = exp ? new Date(exp) : null
            const resellerExpired = expDate ? expDate.getTime() <= Date.now() : false
            return (
              <Link href="/dashboard/billing" className={styles.usageMini} onClick={onClose}>
                <div className={styles.usageMiniHeader}>
                  <span className={`${styles.usageMiniPlanDot} ${resellerExpired ? styles.dotDanger : styles.dotOk}`} />
                  <span className={styles.usageMiniPlan}>My plan</span>
                  <span className={`${styles.usageMiniPct} ${resellerExpired ? styles.textDanger : ""}`}>{credits.toLocaleString()} cr</span>
                </div>
                {expDate && (
                  <div className={styles.expiringHint}>
                    {resellerExpired
                      ? "Plan expired — contact your provider"
                      : `Valid until ${expDate.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`}
                  </div>
                )}
              </Link>
            )
          }
          const plan = stats.plan ?? "free"
          const planLabel = PLAN_LABELS[plan] ?? plan
          const used = stats.monthlyCreditsUsed ?? 0
          const limit = stats.creditLimit ?? 0
          const unlimited = limit === -1
          const pct = unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
          const remaining = unlimited ? null : Math.max(0, limit - used)
          const isWarning = !unlimited && pct >= 75
          const isDanger = !unlimited && pct >= 90

          // Subscription expiry awareness. Free plan has no expiry; paid
          // plans get an "expires in N days" hint inside the window and a
          // hard "Expired" state once the date is past.
          const expiresAt = stats.subscriptionExpiresAt ? new Date(stats.subscriptionExpiresAt) : null
          let expiryState: "none" | "expiring" | "expired" = "none"
          let daysUntilExpiry = 0
          if (plan !== "free" && expiresAt) {
            const msUntil = expiresAt.getTime() - Date.now()
            if (msUntil <= 0) {
              expiryState = "expired"
            } else {
              daysUntilExpiry = Math.ceil(msUntil / (24 * 60 * 60 * 1000))
              if (daysUntilExpiry <= 7) expiryState = "expiring"
            }
          }

          // Expired takes over the whole card — usage is moot until they
          // renew (the agents have stopped replying anyway).
          if (expiryState === "expired") {
            return (
              <Link href="/dashboard/billing" className={`${styles.usageMini} ${styles.usageMiniExpired}`} onClick={onClose}>
                <div className={styles.usageMiniHeader}>
                  <span className={`${styles.usageMiniPlanDot} ${styles.dotDanger}`} />
                  <span className={styles.usageMiniPlan}>{planLabel}</span>
                  <span className={`${styles.usageMiniPct} ${styles.textDanger}`}>Expired</span>
                </div>
                <div className={styles.expiredBanner}>
                  <div className={styles.expiredTitle}>Subscription expired</div>
                  <div className={styles.expiredDesc}>Your AI agents have stopped replying. Renew to bring them back online.</div>
                </div>
                <div className={styles.expiredCta}>Renew now →</div>
              </Link>
            )
          }

          return (
            <Link href="/dashboard/billing" className={styles.usageMini} onClick={onClose}>
              <div className={styles.usageMiniHeader}>
                <span className={`${styles.usageMiniPlanDot} ${isDanger ? styles.dotDanger : isWarning ? styles.dotWarning : styles.dotOk}`} />
                <span className={styles.usageMiniPlan}>{planLabel}</span>
                <span className={`${styles.usageMiniPct} ${isDanger ? styles.textDanger : isWarning ? styles.textWarning : ""}`}>
                  {unlimited ? "∞" : `${pct}%`}
                </span>
              </div>
              {expiryState === "expiring" && (
                <div className={styles.expiringHint}>
                  ⚠ Expires in {daysUntilExpiry} {daysUntilExpiry === 1 ? "day" : "days"} · Renew
                </div>
              )}
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

        {!collapsed && brand.supportWhatsapp && (
          <div className={styles.navItemWrap}>
            <a
              href={`https://wa.me/${brand.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I need help with my account.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.navLink}
            >
              <span className={styles.navIcon}><ChatBubbleLeftRightIcon width={16} height={16} /></span>
              Contact support
            </a>
          </div>
        )}

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
