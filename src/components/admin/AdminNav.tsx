"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Squares2X2Icon, UsersIcon, CpuChipIcon, ArrowUturnLeftIcon, EnvelopeIcon, ChartBarIcon, GiftIcon,
  CreditCardIcon, SignalIcon, BuildingStorefrontIcon, ExclamationTriangleIcon, BanknotesIcon,
  ArrowTrendingUpIcon, PaperAirplaneIcon, PhotoIcon,
} from "@heroicons/react/24/outline"
import styles from "@/app/admin/layout.module.css"

type Icon = typeof UsersIcon

const groups: Array<{ label: string; items: Array<{ href: string; label: string; icon: Icon }> }> = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Overview", icon: Squares2X2Icon },
      { href: "/admin/analytics", label: "Analytics", icon: ChartBarIcon },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: UsersIcon },
      { href: "/admin/agents", label: "Agents", icon: CpuChipIcon },
      { href: "/admin/resellers", label: "Resellers", icon: BuildingStorefrontIcon },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { href: "/admin/status", label: "Status", icon: PhotoIcon },
      { href: "/admin/sessions", label: "Sessions", icon: SignalIcon },
      { href: "/admin/events", label: "Events", icon: ExclamationTriangleIcon },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCardIcon },
      { href: "/admin/revenue", label: "Revenue", icon: ArrowTrendingUpIcon },
      { href: "/admin/finances", label: "Finances", icon: BanknotesIcon },
      { href: "/admin/referrals", label: "Referrals", icon: GiftIcon },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/outreach", label: "Outreach", icon: PaperAirplaneIcon },
      { href: "/admin/newsletter", label: "Newsletter", icon: EnvelopeIcon },
    ],
  },
]

export function AdminNav() {
  const pathname = usePathname()
  // "/admin" would prefix-match every page, so the overview only matches exactly.
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <nav className={styles.nav} aria-label="Admin">
      {groups.map((group) => (
        <div key={group.label} className={styles.navGroup} role="group" aria-labelledby={`admin-nav-${group.label}`}>
          <div className={styles.navLabel} id={`admin-nav-${group.label}`}>{group.label}</div>
          {group.items.map(({ href, label, icon: ItemIcon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.navLink} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <ItemIcon width={16} height={16} className={styles.navIcon} aria-hidden="true" />
                {label}
              </Link>
            )
          })}
        </div>
      ))}

      <div className={styles.navGroup} role="group" aria-labelledby="admin-nav-Account">
        <div className={styles.navLabel} id="admin-nav-Account">Account</div>
        <Link href="/dashboard" className={styles.navLink}>
          <ArrowUturnLeftIcon width={16} height={16} className={styles.navIcon} aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </nav>
  )
}
