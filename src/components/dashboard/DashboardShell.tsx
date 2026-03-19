"use client"

import { useState } from "react"
import Link from "next/link"
import { Sidebar } from "./Sidebar"
import { LogoIcon } from "@/components/landing/Logo"
import styles from "./DashboardShell.module.css"

interface Props {
  userName: string
  businessName: string
  children: React.ReactNode
}

export function DashboardShell({ userName, businessName, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={styles.shell}>
      {/* Mobile top bar */}
      <header className={styles.mobileHeader}>
        <button
          className={styles.hamburger}
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
        >
          <span />
          <span />
          <span />
        </button>
        <Link href="/dashboard" className={styles.mobileLogo}>
          <LogoIcon size={24} />
          D-Zero AI
        </Link>
        <div className={styles.hamburgerSpacer} />
      </header>

      {/* Backdrop */}
      {isOpen && (
        <div className={styles.backdrop} onClick={() => setIsOpen(false)} />
      )}

      <Sidebar
        userName={userName}
        businessName={businessName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />

      <main className={styles.main}>{children}</main>
    </div>
  )
}
