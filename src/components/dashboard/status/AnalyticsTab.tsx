"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Button from "@/components/ui/Button"
import { postProgress, type StatusKind } from "@/lib/status-post"
import { JobProgress, ProgressBar, useStatusJobs, type StatusJob } from "./StatusJobs"
import shared from "./ContactsTab.module.css"
import styles from "./AnalyticsTab.module.css"

interface PostStats {
  id: string
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  mediaItemId: string | null
  aiNote: string | null
  status: string
  error: string | null
  scheduledAt: string
  postedAt: string | null
  recipientCount: number
  delivered: number
  viewed: number
  liked: number
  replied: number
}

interface Person {
  phone: string
  name: string | null
  viewedAt: string | null
  likedAt: string | null
  repliedAt: string | null
}

const WINDOW_DAYS = 7
const KIND_LABEL = { text: "Text", image: "Image", video: "Video" } as const

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Couldn't load")
  return data
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–"
}

const DISMISSED_KEY = "status-dismissed-failures"

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]")
  } catch {
    return []
  }
}

export function AnalyticsTab({ agentId }: { agentId: string }) {
  const { jobs, enqueue } = useStatusJobs()
  const running = jobs.filter((j) => j.agentId === agentId && j.target === "post")
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const [openId, setOpenId] = useState<string | null>(null)
  // Fixed at mount: the 7-day window doesn't need to slide while the tab is open.
  const [now] = useState(() => Date.now())

  // Same query as the Posts tab, so switching tabs doesn't refetch.
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["status-posts", agentId],
    queryFn: () => fetchJson<{ posts: PostStats[] }>(`/api/agents/${agentId}/status-posts`),
    // Quick while something is on its way, so "Posted" shows up soon after it happens.
    refetchInterval: (q) => {
      const active = q.state.data?.posts.some((p) => {
        const progress = postProgress(p, Date.now())
        return progress === "waiting" || progress === "posting"
      })
      return active ? 4_000 : 30_000
    },
  })

  if (isLoading) return <div className={shared.empty}>Loading analytics…</div>
  if (error || !data) return <div className={shared.empty}>{(error as Error)?.message ?? "Couldn't load analytics."}</div>

  const posted = data.posts.filter((p) => p.postedAt)
  const since = now - WINDOW_DAYS * 86_400_000
  const recent = posted.filter((p) => new Date(p.postedAt!).getTime() >= since)
  const sum = (k: "recipientCount" | "delivered" | "viewed" | "liked" | "replied") => recent.reduce((n, p) => n + p[k], 0)
  const totals = { sent: sum("recipientCount"), delivered: sum("delivered"), viewed: sum("viewed"), liked: sum("liked"), replied: sum("replied") }

  const inProgress = data.posts
    .map((post) => ({ post, progress: postProgress(post, dataUpdatedAt) }))
    .filter((p) => p.progress && !(p.progress === "failed" && dismissed.includes(p.post.id)))

  function dismissPost(id: string) {
    const next = [...dismissed, id].slice(-100)
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch { /* only costs the row coming back after a reload */ }
  }

  function retryPost(post: PostStats) {
    dismissPost(post.id)
    enqueue({
      agentId,
      target: "post",
      kind: post.kind,
      file: null,
      mediaItemId: post.mediaItemId,
      text: post.text ?? undefined,
      backgroundColor: post.backgroundColor ?? undefined,
      aiNote: post.aiNote ?? undefined,
    })
  }

  const progressSection = (running.length > 0 || inProgress.length > 0) && (
    <section className={styles.list} aria-live="polite">
      <div className={shared.sectionTitle}>In progress</div>
      {running.map((job) => (
        <div key={job.id} className={styles.post}>
          <JobTitle job={job} />
          <JobProgress job={job} />
        </div>
      ))}
      {inProgress.map(({ post, progress }) => (
        <div key={post.id} className={styles.post}>
          <div className={`${styles.postInfo} ${styles.progressInfo}`}>
            <span className={shared.muted}>{KIND_LABEL[post.kind]}</span>
            <span className={styles.postText}>{post.text || post.aiNote || `${KIND_LABEL[post.kind]} post`}</span>
          </div>
          {progress === "failed" ? (
            <>
              <p className={shared.error}>{post.error ?? "This post failed."}</p>
              <div className={styles.progressActions}>
                <Button type="button" size="sm" onClick={() => retryPost(post)}>Try again</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => dismissPost(post.id)}>Dismiss</Button>
              </div>
            </>
          ) : (
            <ServerProgress kind={post.kind} progress={progress} />
          )}
        </div>
      ))}
    </section>
  )

  if (posted.length === 0) {
    return (
      <div className={shared.wrap}>
        {progressSection}
        {!progressSection && <div className={shared.empty}>Post a status and its views, likes and replies show up here.</div>}
      </div>
    )
  }

  return (
    <div className={shared.wrap}>
      {progressSection}
      <div className={styles.totals}>
        <Stat label="Sent to" value={totals.sent} />
        <Stat label="Delivered" value={totals.delivered} hint={pct(totals.delivered, totals.sent)} />
        <Stat label="Viewed" value={totals.viewed} hint={pct(totals.viewed, totals.sent)} />
        <Stat label="Liked" value={totals.liked} />
        <Stat label="Replied" value={totals.replied} />
      </div>
      <p className={shared.muted}>
        Last {WINDOW_DAYS} days, {recent.length} {recent.length === 1 ? "post" : "posts"}. Views are a minimum: people who turned off read
        receipts watch without showing up. Every reply goes to the AI and appears in Chats.
      </p>

      <section className={styles.list}>
        <div className={shared.sectionTitle}>Each post</div>
        {posted.map((p) => (
          <div key={p.id} className={styles.post}>
            <button
              type="button"
              className={styles.postHead}
              aria-expanded={openId === p.id}
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
            >
              <div className={styles.postInfo}>
                <span className={shared.muted}>{KIND_LABEL[p.kind]} · {when(p.postedAt!)}{p.status === "deleted" ? " · deleted" : ""}</span>
                <span className={styles.postText}>{p.text || p.aiNote || `${KIND_LABEL[p.kind]} post`}</span>
              </div>
              <div className={styles.funnel}>
                <Step label="sent" value={p.recipientCount} />
                <Step label="viewed" value={p.viewed} />
                <Step label="liked" value={p.liked} />
                <Step label="replied" value={p.replied} strong />
              </div>
            </button>
            <div className={styles.bar} aria-hidden>
              <span className={styles.barFill} style={{ width: pct(p.viewed, p.recipientCount) === "–" ? "0%" : pct(p.viewed, p.recipientCount) }} />
            </div>
            {openId === p.id && <People agentId={agentId} postId={p.id} />}
          </div>
        ))}
      </section>
    </div>
  )
}

function JobTitle({ job }: { job: StatusJob }) {
  return (
    <div className={`${styles.postInfo} ${styles.progressInfo}`}>
      <span className={shared.muted}>{KIND_LABEL[job.kind]}{job.scheduledAt ? ` · scheduled for ${when(job.scheduledAt)}` : ""}</span>
      <span className={styles.postText}>{job.text || job.aiNote || job.file?.name || `${KIND_LABEL[job.kind]} post`}</span>
    </div>
  )
}

function ServerProgress({ kind, progress }: { kind: StatusKind; progress: "waiting" | "posting" | "failed" | null }) {
  const label = progress === "waiting" ? "Saved, waiting to post…" : kind === "video" ? "Preparing your video and posting…" : "Posting…"
  return (
    <div className={styles.serverProgress}>
      <span className={shared.muted}>{label}</span>
      <ProgressBar label={label} />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={shared.stat}>
      <div className={shared.statValue}>{value.toLocaleString()}</div>
      <div className={shared.statLabel}>{label}</div>
      {hint && <div className={shared.statHint}>{hint} of sent</div>}
    </div>
  )
}

function Step({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <span className={`${styles.step} ${strong ? styles.stepStrong : ""}`}>
      <span className={styles.stepValue}>{value.toLocaleString()}</span> {label}
    </span>
  )
}

function People({ agentId, postId }: { agentId: string; postId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["status-post-people", postId],
    queryFn: () => fetchJson<{ people: Person[] }>(`/api/agents/${agentId}/status-posts/${postId}`),
    refetchInterval: 60_000,
  })

  if (isLoading) return <div className={shared.muted}>Loading…</div>
  if (error || !data) return <div className={shared.error}>{(error as Error)?.message ?? "Couldn't load viewers."}</div>
  if (data.people.length === 0) return <div className={shared.muted}>No views recorded yet.</div>

  return (
    <ul className={styles.people}>
      {data.people.map((person) => (
        <li key={person.phone} className={styles.person}>
          <span className={styles.personName}>{person.name ?? `+${person.phone}`}</span>
          <span className={styles.tags}>
            {person.repliedAt && <span className={`${styles.tag} ${styles.tagReplied}`}>Replied</span>}
            {person.likedAt && <span className={`${styles.tag} ${styles.tagLiked}`}>Liked</span>}
            {person.viewedAt && <span className={styles.tag}>Viewed</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
