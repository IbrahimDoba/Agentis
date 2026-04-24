"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Sidebar } from "./Sidebar"
import { LogoIcon } from "@/components/landing/Logo"
import { ToastProvider } from "@/context/ToastContext"
import styles from "./DashboardShell.module.css"

interface Props {
  userName: string
  businessName: string
  currentUserId: string
  currentWorkspaceId: string | null
  children: React.ReactNode
}

export function DashboardShell({ userName, businessName, currentUserId, currentWorkspaceId, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "true")
  }, [])

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("sidebar-collapsed", String(next))
      return next
    })
  }

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
        currentUserId={currentUserId}
        currentWorkspaceId={currentWorkspaceId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />

      <main className={styles.main}>
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  )
}
