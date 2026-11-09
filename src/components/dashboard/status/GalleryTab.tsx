"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import { mediaPreviewUrl, type StatusDraft, type StatusKind } from "@/lib/status-post"
import { TAGS_PER_ITEM, normalizeTags } from "@/lib/status-autopilot"
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
  tags: string[]
  autopilot: boolean
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

  const [suggestions, setSuggestions] = useState<Array<{ id: string; tags: string[] }> | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  async function patch(item: GalleryItem, body: { tags?: string[]; autopilot?: boolean }, success?: string): Promise<boolean> {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/agents/${agentId}/status-gallery/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(data?.error ?? "Something went wrong.", "error")
        return false
      }
      if (success) showToast(success)
      return true
    } catch {
      showToast("Something went wrong. Please try again.", "error")
      return false
    } finally {
      setBusyId(null)
      void queryClient.invalidateQueries({ queryKey: ["status-gallery", agentId] })
      void queryClient.invalidateQueries({ queryKey: ["status-autopilot", agentId] })
    }
  }

  async function suggest() {
    setSuggesting(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/status-gallery/suggest-tags`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) return showToast(data?.error ?? "Couldn't suggest tags right now.", "error")
      if (!data.suggestions.length) {
        return showToast(data.untagged ? "No suggestions. Posts without a caption or AI note need tags added by hand." : "Every post already has tags.")
      }
      setSuggestions(data.suggestions)
    } catch {
      showToast("Couldn't suggest tags right now.", "error")
    } finally {
      setSuggesting(false)
    }
  }

  async function applySuggestions() {
    if (!suggestions) return
    setSuggesting(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/status-gallery/suggest-tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: suggestions }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return showToast(body?.error ?? "Couldn't save the tags.", "error")
      setSuggestions(null)
      showToast("Tags added.")
    } catch {
      showToast("Couldn't save the tags.", "error")
    } finally {
      setSuggesting(false)
      void queryClient.invalidateQueries({ queryKey: ["status-gallery", agentId] })
      void queryClient.invalidateQueries({ queryKey: ["status-autopilot", agentId] })
    }
  }

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
      <div className={shared.cardRow}>
        <p className={shared.lead}>
          Everything you&apos;ve posted or saved. Post any of it again with its caption and AI note, without uploading it again. Tags let
          Autopilot post certain things at certain times.
        </p>
        <Button type="button" size="sm" variant="secondary" loading={suggesting} onClick={() => void suggest()}>
          Suggest tags
        </Button>
      </div>
      {suggestions && (
        <section className={shared.card}>
          <div className={shared.cardTitle}>Suggested tags</div>
          <ul className={shared.facts}>
            {suggestions.map((sug) => {
              const item = data.items.find((i) => i.id === sug.id)
              return (
                <li key={sug.id}>
                  <strong>{item?.text || item?.aiNote || "Post"}</strong>: {sug.tags.join(", ")}
                </li>
              )
            })}
          </ul>
          <div className={shared.actions}>
            <Button type="button" size="sm" loading={suggesting} onClick={() => void applySuggestions()}>Add these tags</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestions(null)}>Dismiss</Button>
          </div>
        </section>
      )}
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
              <TagEditor
                tags={item.tags}
                busy={busyId === item.id}
                onSave={(tags) => patch(item, { tags }, "Tags saved.")}
              />
              <label className={styles.tick}>
                <input
                  type="checkbox"
                  checked={item.autopilot}
                  disabled={busyId === item.id}
                  onChange={(e) => void patch(item, { autopilot: e.target.checked }, e.target.checked ? "Autopilot can post this." : "Autopilot won't post this.")}
                />
                Autopilot can post this
              </label>
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

function TagEditor({ tags, busy, onSave }: { tags: string[]; busy: boolean; onSave: (tags: string[]) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const parsed = normalizeTags(value.split(","))
  const tooMany = parsed.length > TAGS_PER_ITEM

  if (!editing) {
    return (
      <div className={styles.tags}>
        {tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
        <button
          type="button"
          className={styles.tagEdit}
          onClick={() => {
            setValue(tags.join(", "))
            setEditing(true)
          }}
        >
          {tags.length ? "Edit tags" : "Add tags"}
        </button>
      </div>
    )
  }

  const save = async () => {
    if (tooMany) return
    if (await onSave(parsed)) setEditing(false)
  }

  return (
    <div className={styles.tagForm}>
      <input
        className={shared.input}
        value={value}
        autoFocus
        placeholder="ankara, offer"
        aria-label="Tags, separated by commas"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save()
          if (e.key === "Escape") setEditing(false)
        }}
      />
      {tooMany && <span className={shared.error}>Up to {TAGS_PER_ITEM} tags</span>}
      <div className={shared.actions}>
        <Button type="button" size="sm" loading={busy} disabled={tooMany} onClick={() => void save()}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
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
