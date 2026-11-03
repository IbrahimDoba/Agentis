"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import type { StatusKind } from "@/lib/status-post"
import { uploadMedia } from "./uploadMedia"
import styles from "./StatusJobs.module.css"

export interface StatusJobInput {
  agentId: string
  target: "post" | "gallery"
  kind: StatusKind
  file: File | null
  mediaItemId: string | null
  text?: string
  backgroundColor?: string
  aiNote?: string
  scheduledAt?: string
}

export interface StatusJob extends StatusJobInput {
  id: string
  phase: "uploading" | "saving" | "failed"
  percent: number
  error: string | null
  // Set once a direct upload reaches storage, before it's saved to the library.
  storedKey: string | null
}

interface JobsValue {
  jobs: StatusJob[]
  enqueue: (input: StatusJobInput) => void
  retry: (job: StatusJob) => void
  dismiss: (id: string) => void
}

const JobsContext = createContext<JobsValue | null>(null)

export function useStatusJobs(): JobsValue {
  const value = useContext(JobsContext)
  if (!value) throw new Error("useStatusJobs must be used inside StatusJobsProvider")
  return value
}

async function createContent(job: StatusJob, mediaItemId: string | null): Promise<void> {
  const res = await fetch(`/api/agents/${job.agentId}/${job.target === "post" ? "status-posts" : "status-gallery"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: job.kind,
      text: job.text,
      backgroundColor: job.backgroundColor,
      mediaItemId: mediaItemId ?? undefined,
      aiNote: job.aiNote,
      scheduledAt: job.scheduledAt,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? (job.target === "post" ? "Couldn't create the post." : "Couldn't save to the gallery."))
}

function doneMessage(job: StatusJob): string {
  if (job.target === "gallery") return "Saved to your gallery."
  if (job.scheduledAt) return `Scheduled for ${new Date(job.scheduledAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
  return "Posting to your status now."
}

// Lives in the dashboard shell, not the Status page, so an upload keeps going
// while the owner moves between tabs and pages.
export function StatusJobsProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [jobs, setJobs] = useState<StatusJob[]>([])
  const nextId = useRef(0)

  const patch = useCallback((id: string, change: Partial<StatusJob>) => {
    setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...change } : j)))
  }, [])

  const run = useCallback(async (job: StatusJob) => {
    const { id, agentId } = job
    let mediaItemId = job.mediaItemId
    try {
      if (job.file && !mediaItemId) {
        patch(id, { phase: "uploading", percent: job.storedKey ? 100 : 0, error: null })
        mediaItemId = await uploadMedia(agentId, job.file, job.aiNote ?? "", {
          onProgress: (percent) => patch(id, { percent }),
          storedKey: job.storedKey,
          onStored: (storedKey) => patch(id, { storedKey }),
        })
        // Kept on the job, so a retry after this point doesn't upload again.
        patch(id, { mediaItemId, phase: "saving" })
        void queryClient.invalidateQueries({ queryKey: ["media", agentId] })
      } else {
        patch(id, { phase: "saving", error: null })
      }
      await createContent(job, mediaItemId)
      // Refetched before the job goes, so its row is replaced rather than
      // vanishing for a moment.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["status-posts", agentId] }),
        queryClient.invalidateQueries({ queryKey: ["status-gallery", agentId] }),
      ])
      setJobs((all) => all.filter((j) => j.id !== id))
      showToast(doneMessage(job))
    } catch (err) {
      const message = err instanceof TypeError ? "Something went wrong. Please try again." : (err as Error).message
      patch(id, { phase: "failed", error: message })
      showToast(message, "error")
    }
  }, [patch, queryClient, showToast])

  const enqueue = useCallback((input: StatusJobInput) => {
    nextId.current += 1
    const job: StatusJob = { ...input, id: `job-${nextId.current}`, phase: input.file ? "uploading" : "saving", percent: 0, error: null, storedKey: null }
    setJobs((all) => [job, ...all])
    void run(job)
  }, [run])

  const retry = useCallback((job: StatusJob) => void run(job), [run])
  const dismiss = useCallback((id: string) => setJobs((all) => all.filter((j) => j.id !== id)), [])

  // A browser can't carry on an upload once the page is gone.
  const running = jobs.some((j) => j.phase !== "failed")
  useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [running])

  const value = useMemo(() => ({ jobs, enqueue, retry, dismiss }), [jobs, enqueue, retry, dismiss])
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function jobLabel(job: Pick<StatusJob, "phase" | "percent" | "target" | "error">): string {
  if (job.phase === "failed") return job.error ?? "Something went wrong."
  if (job.phase === "saving") return job.target === "gallery" ? "Saving to your gallery…" : "Saved, waiting to post…"
  return job.percent >= 100 ? "Finishing the upload…" : `Uploading ${job.percent}%`
}

// No percent means there's nothing to measure yet, so the bar just shows activity.
export function ProgressBar({ percent, label }: { percent?: number; label: string }) {
  const known = percent !== undefined
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? percent : undefined}
    >
      <span className={known ? styles.fill : styles.busy} style={known ? { width: `${percent}%` } : undefined} />
    </div>
  )
}

export function JobProgress({ job }: { job: StatusJob }) {
  const { retry, dismiss } = useStatusJobs()
  const label = jobLabel(job)
  if (job.phase === "failed") {
    return (
      <div className={styles.progress}>
        <p className={styles.error}>{label}</p>
        <div className={styles.actions}>
          <Button type="button" size="sm" onClick={() => retry(job)}>Try again</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => dismiss(job.id)}>Dismiss</Button>
        </div>
      </div>
    )
  }
  return (
    <div className={styles.progress}>
      <span className={styles.label}>{label}</span>
      <ProgressBar percent={job.phase === "uploading" && job.percent < 100 ? job.percent : undefined} label={label} />
    </div>
  )
}
