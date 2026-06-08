"use client"

import Link from "next/link"
import {
  CalendarDaysIcon,
  BoltIcon,
  CodeBracketIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline"
import { useToast } from "@/context/ToastContext"
import styles from "./page.module.css"

type Integration = {
  key: string
  name: string
  description: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  href?: string // set => available; absent => coming soon
}

const INTEGRATIONS: Integration[] = [
  {
    key: "google-calendar",
    name: "Google Calendar",
    description: "Let your agent check availability and book appointments on your calendar.",
    icon: CalendarDaysIcon,
  },
  {
    key: "zapier",
    name: "Zapier",
    description: "Connect your agent to 6,000+ apps and automate workflows — no code.",
    icon: BoltIcon,
  },
  {
    key: "developer",
    name: "Developer API",
    description: "Run and manage your agents from your own apps. Create and manage API keys.",
    icon: CodeBracketIcon,
    href: "/dashboard/api-keys",
  },
]

export default function DeveloperPage() {
  const { showToast } = useToast()

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>
          Connect your agents to the tools you already use, and build on top of them with the API.
        </p>
      </div>

      <div className={styles.grid}>
        {INTEGRATIONS.map((it) => {
          const Icon = it.icon
          const available = !!it.href

          const inner = (
            <>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>
                  <Icon width={22} height={22} />
                </span>
                {available ? (
                  <ArrowRightIcon width={18} height={18} className={styles.arrow} />
                ) : (
                  <span className={styles.soonBadge}>Coming soon</span>
                )}
              </div>
              <div className={styles.cardName}>{it.name}</div>
              <div className={styles.cardDesc}>{it.description}</div>
            </>
          )

          return available ? (
            <Link key={it.key} href={it.href!} className={styles.card}>
              {inner}
            </Link>
          ) : (
            <button
              key={it.key}
              type="button"
              className={`${styles.card} ${styles.cardSoon}`}
              onClick={() => showToast(`${it.name} integration is coming soon 🚧`)}
            >
              {inner}
            </button>
          )
        })}
      </div>
    </div>
  )
}
