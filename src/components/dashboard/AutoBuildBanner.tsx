"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useVisibleInterval } from "@/lib/useVisibleInterval"
import {
  AUTO_BUILD_DONE,
  AUTO_BUILD_STEPS,
  AUTO_BUILD_WAITING,
  autoBuildStepIndex,
  isAutoBuildInProgress,
} from "@/lib/autoBuild"
import styles from "./AutoBuildBanner.module.css"

const POLL_MS = 3_000

export function AutoBuildBanner() {
  const [agent, setAgent] = useState<{ id: string; status: string } | null>(null)
  // Starts true so the first lookup runs. Goes false for owners with nothing to
  // show, so everyone else's dashboard isn't polling for a banner.
  const [watching, setWatching] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch("/api/agents/auto-build").catch(() => null)
    if (!res?.ok) return
    const data = (await res.json()) as { agent: { id: string; status: string } | null }
    setAgent(data.agent)
    setWatching(data.agent !== null && data.agent.status !== AUTO_BUILD_DONE)
  }, [])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])
  useVisibleInterval(load, POLL_MS, watching)

  const dismiss = useCallback(() => {
    if (!agent) return
    setAgent(null)
    fetch(`/api/agents/${agent.id}/auto-build/dismiss`, { method: "POST" }).catch(() => {})
  }, [agent])

  if (!agent || agent.status === AUTO_BUILD_WAITING) return null

  if (agent.status === AUTO_BUILD_DONE) {
    return (
      <div className={`${styles.banner} ${styles.done}`} role="status">
        <span className={styles.title}>Your AI agent is live and replying to customers.</span>
        <div className={styles.actions}>
          <Link href="/dashboard/agents" className={styles.link}>
            Review or edit
          </Link>
          <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    )
  }

  if (!isAutoBuildInProgress(agent.status)) return null

  const current = autoBuildStepIndex(agent.status)
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.title}>{AUTO_BUILD_STEPS[current]}…</span>
      <span className={styles.steps} aria-hidden="true">
        {AUTO_BUILD_STEPS.map((step, i) => (
          <span key={step} className={`${styles.step} ${i <= current ? styles.stepActive : ""}`} />
        ))}
      </span>
      <span className={styles.note}>You can keep using the dashboard while we set up your agent.</span>
    </div>
  )
}
