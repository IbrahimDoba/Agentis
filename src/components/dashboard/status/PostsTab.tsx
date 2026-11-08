"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import {
  AI_NOTE_MAX,
  CAPTION_MAX,
  TEXT_BACKGROUNDS,
  TEXT_STATUS_MAX,
  isVideoMime,
  mediaPreviewUrl,
  type StatusDraft,
  type StatusKind,
} from "@/lib/status-post"
import { formatMb, statusMediaSizeError, MAX_IMAGE_BYTES, MAX_STATUS_VIDEO_BYTES, MAX_VIDEO_BYTES } from "@/lib/media-limits"
import { useStatusJobs } from "./StatusJobs"
import shared from "./ContactsTab.module.css"
import styles from "./PostsTab.module.css"

interface Post {
  id: string
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  mediaItemId: string | null
  aiNote: string | null
  source: "manual" | "autopilot"
  status: "scheduled" | "posting" | "posted" | "failed" | "cancelled" | "deleting" | "deleted"
  scheduledAt: string
  postedAt: string | null
  recipientCount: number
  creditsUsed: number
  error: string | null
  viewed: number
  liked: number
  replied: number
}

interface PostsData {
  posts: Post[]
  audience: { contacts: number; cap: number }
  postsToday: number
  maxPostsPerDay: number
  credits: Record<StatusKind, number>
}

interface MediaItem {
  id: string
  filename: string
  mimeType: string
  description: string
}

const STATUS_LABEL: Record<Post["status"], string> = {
  scheduled: "Scheduled",
  posting: "Posting…",
  posted: "Posted",
  failed: "Failed",
  cancelled: "Cancelled",
  deleting: "Deleting…",
  deleted: "Deleted",
}

const KIND_LABEL: Record<StatusKind, string> = { text: "Text", image: "Image", video: "Video" }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Couldn't load")
  return data
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

// <input type="datetime-local"> wants local time without a zone.
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PostsTab({ agentId, isConnected, draft, onQueued }: {
  agentId: string
  isConnected: boolean
  draft?: StatusDraft | null
  onQueued: (target: "post" | "gallery") => void
}) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const { enqueue } = useStatusJobs()

  const [kind, setKind] = useState<StatusKind>(draft?.kind ?? "image")
  const [text, setText] = useState(draft?.text ?? "")
  const [background, setBackground] = useState<string>(draft?.backgroundColor ?? TEXT_BACKGROUNDS[0])
  const [mediaItemId, setMediaItemId] = useState<string | null>(draft?.mediaItemId ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [aiNote, setAiNote] = useState(draft?.aiNote ?? "")
  const [schedule, setSchedule] = useState(false)
  const [scheduledFor, setScheduledFor] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)))
  const [busy, setBusy] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["status-posts", agentId],
    queryFn: () => fetchJson<PostsData>(`/api/agents/${agentId}/status-posts`),
    refetchInterval: (q) => (q.state.data?.posts.some((p) => p.status === "posting" || p.status === "deleting") ? 4000 : 30000),
  })

  const { data: library } = useQuery({
    queryKey: ["media", agentId],
    queryFn: () => fetchJson<{ media: MediaItem[] }>(`/api/agents/${agentId}/media`),
    staleTime: 30_000,
  })

  const choices = useMemo(
    () => (library?.media ?? []).filter((m) => (kind === "video" ? isVideoMime(m.mimeType) : m.mimeType.startsWith("image/"))),
    [library, kind],
  )

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["status-posts", agentId] })

  const pickKind = (k: StatusKind) => {
    setKind(k)
    setMediaItemId(null)
    setFile(null)
  }

  // Reuses the post's library file, so nothing is uploaded again.
  const applyDraft = (d: StatusDraft) => {
    setKind(d.kind)
    setText(d.text ?? "")
    setBackground(d.backgroundColor ?? TEXT_BACKGROUNDS[0])
    setMediaItemId(d.mediaItemId)
    setFile(null)
    setAiNote(d.aiNote ?? "")
    setSchedule(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const pickLibrary = (item: MediaItem) => {
    setFile(null)
    setMediaItemId(item.id)
    // The library description is already written for the AI; start from it.
    if (!aiNote.trim()) setAiNote(item.description)
  }

  function validate(): boolean {
    const problem =
      kind === "text" && !text.trim() ? "Write something for your status."
      : kind !== "text" && !file && !mediaItemId ? `Choose ${kind === "video" ? "a video" : "an image"}.`
      : file && !aiNote.trim() ? "Tell the AI what this post is about, so it can answer replies."
      : null
    if (problem) showToast(problem, "error")
    return !problem
  }

  // Everything in the job is copied out of the composer, so it can clear straight
  // away and the owner can start on the next post while this one uploads.
  function queue(target: "post" | "gallery", scheduledAt?: string) {
    enqueue({
      agentId,
      target,
      kind,
      file: kind === "text" ? null : file,
      mediaItemId: kind === "text" ? null : mediaItemId,
      text: text.trim() || undefined,
      backgroundColor: kind === "text" ? background : undefined,
      aiNote: aiNote.trim() || undefined,
      scheduledAt,
    })
    setText("")
    setFile(null)
    setMediaItemId(null)
    setAiNote("")
    setSchedule(false)
  }

  function submit() {
    if (!validate()) return
    if (schedule && new Date(scheduledFor).getTime() < Date.now()) return showToast("Pick a time in the future.", "error")
    // A scheduled post with nothing to upload has no progress to watch.
    const showProgress = !schedule || (kind !== "text" && !!file)
    queue("post", schedule ? new Date(scheduledFor).toISOString() : undefined)
    if (showProgress) onQueued("post")
  }

  function saveToGallery() {
    if (!validate()) return
    queue("gallery")
    onQueued("gallery")
  }

  async function act(post: Post, action: "cancel" | "delete") {
    if (action === "delete" && !confirm("Delete this status from WhatsApp? It disappears for everyone who hasn't seen it yet.")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/status-posts/${post.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) showToast(body?.error ?? "Something went wrong.", "error")
      else showToast(action === "cancel" ? "Post cancelled." : "Deleting from your status.")
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  if (isLoading) return <div className={shared.empty}>Loading posts…</div>
  if (error || !data) return <div className={shared.empty}>{(error as Error)?.message ?? "Couldn't load posts."}</div>

  const reach = Math.min(data.audience.contacts, data.audience.cap)
  const atDailyLimit = !schedule && data.postsToday >= data.maxPostsPerDay
  const selectedItem = choices.find((c) => c.id === mediaItemId) ?? null

  return (
    <div className={shared.wrap}>
      <div className={shared.stats}>
        <div className={shared.stat}>
          <div className={shared.statValue}>{reach.toLocaleString()}</div>
          <div className={shared.statLabel}>Saved contacts each post reaches</div>
          {data.audience.contacts > data.audience.cap && (
            <div className={shared.statHint}>Your plan reaches up to {data.audience.cap.toLocaleString()} per post</div>
          )}
        </div>
        <div className={shared.stat}>
          <div className={shared.statValue}>{data.postsToday} / {data.maxPostsPerDay}</div>
          <div className={shared.statLabel}>Posts today</div>
        </div>
      </div>

      {data.audience.contacts === 0 && (
        <div className={shared.warn}>Status only reaches people saved in your phone. Save your chats in the Contacts tab first.</div>
      )}
      {!isConnected && <div className={shared.warn}>Your WhatsApp number isn&apos;t connected. Posts wait until it reconnects.</div>}

      <section className={`${shared.card} ${styles.composer}`}>
        <div className={styles.form}>
          <div className={styles.segment} role="radiogroup" aria-label="Post type">
            {(["image", "video", "text"] as StatusKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={`${styles.segmentBtn} ${kind === k ? styles.segmentOn : ""}`}
                onClick={() => pickKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {kind === "text" ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Your status</span>
                <textarea
                  className={`${shared.input} ${styles.wide} ${styles.textarea}`}
                  value={text}
                  maxLength={TEXT_STATUS_MAX}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="New stock just landed. Send us a message to order."
                />
              </label>
              <div className={styles.field}>
                <span className={styles.label}>Background</span>
                <div className={styles.swatches}>
                  {TEXT_BACKGROUNDS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Background ${c}`}
                      aria-pressed={background === c}
                      className={`${styles.swatch} ${background === c ? styles.swatchOn : ""}`}
                      style={{ background: c }}
                      onClick={() => setBackground(c)}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.field}>
                <span className={styles.label}>{kind === "video" ? "Choose a video" : "Choose an image"}</span>
                <label className={styles.upload}>
                  <input
                    type="file"
                    accept={kind === "video" ? "video/mp4,video/quicktime,video/*" : "image/jpeg,image/png,image/webp"}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      const tooLarge = f && statusMediaSizeError(f.size, f.type)
                      if (tooLarge) {
                        e.target.value = ""
                        return showToast(tooLarge, "error")
                      }
                      setFile(f)
                      if (f) setMediaItemId(null)
                    }}
                  />
                  {file ? file.name : `Upload ${kind === "video" ? `a video (up to ${formatMb(MAX_STATUS_VIDEO_BYTES)})` : `an image (up to ${formatMb(MAX_IMAGE_BYTES)})`}`}
                </label>
                {kind === "video" && (
                  <span className={shared.muted}>
                    Videos are cut to 60 seconds. Over {formatMb(MAX_VIDEO_BYTES)}, they can go on your status but your AI can&rsquo;t send them in chats.
                  </span>
                )}
                {choices.length > 0 && (
                  <div className={styles.library}>
                    <span className={shared.muted}>Or pick from your media library</span>
                    {choices.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.libraryItem} ${mediaItemId === item.id ? styles.libraryItemOn : ""}`}
                        onClick={() => pickLibrary(item)}
                      >
                        <span className={styles.libraryName}>{item.filename}</span>
                        <span className={styles.libraryDesc}>{item.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Caption <span className={shared.muted}>(optional)</span></span>
                <input className={`${shared.input} ${styles.wide}`} value={text} maxLength={CAPTION_MAX} onChange={(e) => setText(e.target.value)} />
              </label>
            </>
          )}

          <label className={styles.field}>
            <span className={styles.label}>
              Tell the AI about this post {kind === "text" || !file ? <span className={shared.muted}>(optional)</span> : null}
            </span>
            <textarea
              className={`${shared.input} ${styles.wide} ${styles.note}`}
              value={aiNote}
              maxLength={AI_NOTE_MAX}
              onChange={(e) => setAiNote(e.target.value)}
              placeholder="Red ankara gown, ₦45,000, sizes 8-16, delivery in Lagos 1-2 days."
            />
            <span className={shared.muted}>When someone replies to this status, the AI reads this first.</span>
          </label>

          <div className={styles.whenRow}>
            <label className={styles.check}>
              <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
              Schedule for later
            </label>
            {schedule && (
              <input
                type="datetime-local"
                className={shared.input}
                value={scheduledFor}
                min={localInputValue(new Date())}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            )}
          </div>

          <div className={styles.submitRow}>
            <span className={shared.muted}>
              {data.credits[kind]} credits · up to {reach.toLocaleString()} contacts
            </span>
            <div className={shared.actions}>
              <Button type="button" variant="secondary" disabled={busy} onClick={saveToGallery}>
                Save to gallery
              </Button>
              <Button type="button" disabled={busy || data.audience.contacts === 0 || atDailyLimit} onClick={submit}>
                {schedule ? "Schedule post" : "Post now"}
              </Button>
            </div>
          </div>
          {atDailyLimit && <span className={shared.error}>You&apos;ve reached today&apos;s {data.maxPostsPerDay} posts. Schedule this one for tomorrow.</span>}
        </div>

        <div className={styles.phone} aria-hidden>
          {kind === "text" ? (
            <div className={styles.phoneText} style={{ background }}>{text || "Your status"}</div>
          ) : preview && file && isVideoMime(file.type) ? (
            <video className={styles.phoneMedia} src={preview} muted loop autoPlay playsInline />
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.phoneMedia} src={preview} alt="" />
          ) : mediaItemId && kind === "video" ? (
            <video className={styles.phoneMedia} src={mediaPreviewUrl(agentId, mediaItemId)} muted loop autoPlay playsInline />
          ) : mediaItemId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.phoneMedia} src={mediaPreviewUrl(agentId, mediaItemId)} alt="" />
          ) : (
            <div className={styles.phoneEmpty}>{selectedItem ? selectedItem.filename : `Your ${kind} appears here`}</div>
          )}
          {kind !== "text" && text && <div className={styles.phoneCaption}>{text}</div>}
        </div>
      </section>

      <section className={styles.list}>
        <div className={shared.sectionTitle}>Your posts</div>
        {data.posts.length === 0 ? (
          <div className={shared.muted}>Nothing posted yet.</div>
        ) : (
          data.posts.map((post) => (
            <div key={post.id} className={styles.post}>
              <div className={styles.postMain}>
                <div className={styles.postTop}>
                  <span className={`${styles.badge} ${styles[`badge_${post.status}`] ?? ""}`}>{STATUS_LABEL[post.status]}</span>
                  <span className={shared.muted}>{KIND_LABEL[post.kind]} · {when(post.postedAt ?? post.scheduledAt)}{post.source === "autopilot" ? " · Autopilot" : ""}</span>
                </div>
                <div className={styles.postText}>{post.text || post.aiNote || `${KIND_LABEL[post.kind]} post`}</div>
                {post.status === "posted" && (
                  <div className={shared.muted}>
                    Sent to {post.recipientCount.toLocaleString()} · {post.viewed} viewed · {post.liked} liked · {post.replied} replied · {post.creditsUsed} credits
                  </div>
                )}
                {post.error && <div className={shared.error}>{post.error}</div>}
              </div>
              <div className={styles.postActions}>
                {post.status !== "scheduled" && post.status !== "posting" && (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => applyDraft(post)}>Post again</Button>
                )}
                {post.status === "scheduled" && (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void act(post, "cancel")}>Cancel</Button>
                )}
                {post.status === "posted" && (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act(post, "delete")}>Delete</Button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
