"use client"

import { useState, useRef, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/24/outline"
import { useRouter } from "next/navigation"
import styles from "./WorkspaceSwitcher.module.css"

interface Workspace {
  id: string
  name: string
  role: string
}

interface Props {
  currentUserId: string
  currentWorkspaceId: string | null
  businessName: string
}

async function fetchWorkspaces(): Promise<{ workspaces: Workspace[] }> {
  const res = await fetch("/api/workspace/workspaces")
  if (!res.ok) throw new Error("Failed")
  return res.json()
}

export function WorkspaceSwitcher({ currentUserId, currentWorkspaceId, businessName }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ["workspace-list"],
    queryFn: fetchWorkspaces,
    staleTime: 60 * 1000,
  })

  const otherWorkspaces = data?.workspaces ?? []

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // If no other workspaces, don't render the switcher
  if (otherWorkspaces.length === 0) return null

  const activeWorkspaceId = currentWorkspaceId ?? currentUserId
  const isOwnWorkspace = activeWorkspaceId === currentUserId
  const activeWorkspace = isOwnWorkspace
    ? { id: currentUserId, name: businessName }
    : otherWorkspaces.find((w) => w.id === activeWorkspaceId) ?? { id: activeWorkspaceId, name: "Workspace" }

  async function switchTo(workspaceId: string) {
    setSwitching(true)
    setOpen(false)
    await fetch("/api/workspace/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspaceId === currentUserId ? null : workspaceId }),
    })
    await qc.invalidateQueries()
    router.refresh()
    setSwitching(false)
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className={styles.triggerInner}>
          <span className={styles.dot} />
          <span className={styles.name}>{activeWorkspace.name}</span>
          {!isOwnWorkspace && <span className={styles.memberPill}>member</span>}
        </div>
        <ChevronUpDownIcon width={14} height={14} className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox">
          <div className={styles.dropdownLabel}>Switch workspace</div>

          {/* Own workspace */}
          <button
            className={`${styles.option} ${isOwnWorkspace ? styles.optionActive : ""}`}
            onClick={() => switchTo(currentUserId)}
            role="option"
            aria-selected={isOwnWorkspace}
          >
            <span className={styles.optionName}>{businessName}</span>
            <span className={styles.optionSub}>My workspace</span>
            {isOwnWorkspace && <CheckIcon width={14} height={14} className={styles.check} />}
          </button>

          {otherWorkspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId
            return (
              <button
                key={ws.id}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                onClick={() => switchTo(ws.id)}
                role="option"
                aria-selected={isActive}
              >
                <span className={styles.optionName}>{ws.name}</span>
                <span className={styles.optionSub}>{ws.role === "ADMIN" ? "Admin" : "Member"}</span>
                {isActive && <CheckIcon width={14} height={14} className={styles.check} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
