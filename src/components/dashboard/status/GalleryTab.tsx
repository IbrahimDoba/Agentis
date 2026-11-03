"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import { mediaPreviewUrl, type StatusDraft, type StatusKind } from "@/lib/status-post"
import { JobProgress, useStatusJobs } from "./StatusJobs"
import shared from "./ContactsTab.module.css"
import styles from "./GalleryTab.module.css"

interface GalleryItem {
  id: string
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  mediaItemId: string | null
  aiNote: string | null
  mediaMissing: boolean
  timesPosted: number
  lastPostedAt: string | null
  bestViewed: number
  bestReplied: number
}

const KIND_LABEL: Record<StatusKind, string> = { text: "Text", image: "Image", video: "Video" }

async function fetchGallery(agentId: string): Promise<{ items: GalleryItem[] }> {
  const res = await fetch(`/api/agents/${agentId}/status-gallery`)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Couldn't load the gallery")
  return data
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
}

export function GalleryTab({ agentId, onPostAgain }: { agentId: string; onPostAgain: (draft: StatusDraft) => void }) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { jobs } = useStatusJobs()
  const saving = jobs.filter((j) => j.agentId === agentId && j.target === "gallery")

  const { data, isLoading, error } = useQuery({
    queryKey: ["status-gallery", agentId],
    queryFn: () => fetchGallery(agentId),
  })

  async function remove(item: GalleryItem) {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/agents/${agentId}/status-gallery/${item.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) showToast(body?.error ?? "Something went wrong.", "error")
      else showToast("Removed from your gallery.")
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setBusyId(null)
      void queryClient.invalidateQueries({ queryKey: ["status-gallery", agentId] })
    }
  }

  if (isLoading) return <div className={shared.empty}>Loading gallery…</div>
  if (error || !data) return <div className={shared.empty}>{(error as Error)?.message ?? "Couldn't load the gallery."}</div>

  if (data.items.length === 0 && saving.length === 0) {
    return (
      <div className={shared.empty}>
        Everything you post shows up here, ready to post again. You can also save a post here from the Posts tab without posting it.
      </div>
    )
  }

  return (
    <div className={shared.wrap}>
      <p className={shared.lead}>
        Everything you&apos;ve posted or saved. Post any of it again with its caption and AI note, without uploading it again.
      </p>
      <div className={styles.grid}>
        {saving.map((job) => (
          <article key={job.id} className={styles.card}>
            <div className={styles.preview}>
              <div className={styles.pending}>{job.file?.name ?? job.text ?? "Saving…"}</div>
              <span className={styles.kind}>{KIND_LABEL[job.kind]}</span>
            </div>
            <div className={styles.body}>
              <JobProgress job={job} />
            </div>
          </article>
        ))}
        {data.items.map((item) => (
          <article key={item.id} className={styles.card}>
            <div className={styles.preview}>
              <Preview agentId={agentId} item={item} />
              <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
            </div>
            <div className={styles.body}>
              {item.kind !== "text" && item.text && <p className={styles.caption}>{item.text}</p>}
              {item.aiNote && <p className={styles.note}>AI note: {item.aiNote}</p>}
              <p className={styles.meta}>
                {item.timesPosted > 0
                  ? `Posted ${item.timesPosted} ${item.timesPosted === 1 ? "time" : "times"} · last ${day(item.lastPostedAt!)}`
                  : "Saved, not posted yet"}
              </p>
              {item.timesPosted > 0 && (
                <p className={styles.meta}>
                  Best: <strong>{item.bestViewed.toLocaleString()}</strong> viewed · <strong>{item.bestReplied.toLocaleString()}</strong> replied
                </p>
              )}
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                size="sm"
                disabled={item.mediaMissing}
                onClick={() => onPostAgain({
                  kind: item.kind,
                  text: item.text,
                  backgroundColor: item.backgroundColor,
                  mediaItemId: item.mediaItemId,
                  aiNote: item.aiNote,
                })}
              >
                Post again
              </Button>
              <Button type="button" size="sm" variant="ghost" loading={busyId === item.id} onClick={() => void remove(item)}>
                Remove
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Preview({ agentId, item }: { agentId: string; item: GalleryItem }) {
  if (item.kind === "text") {
    return <div className={styles.text} style={{ background: item.backgroundColor ?? undefined }}>{item.text}</div>
  }
  if (item.mediaMissing || !item.mediaItemId) {
    return <div className={styles.missing}>This file was removed from your media library</div>
  }
  const src = mediaPreviewUrl(agentId, item.mediaItemId)
  // #t=0.1 makes Safari paint the first frame instead of a blank box.
  return item.kind === "video"
    ? <video className={styles.media} src={`${src}#t=0.1`} preload="metadata" muted playsInline />
    // eslint-disable-next-line @next/next/no-img-element
    : <img className={styles.media} src={src} alt={item.text ?? item.aiNote ?? "Status image"} loading="lazy" />
}
