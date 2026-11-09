"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import { mediaPreviewUrl, type StatusKind } from "@/lib/status-post"
import {
  AUTOPILOT_MAX_SLOTS,
  DAY_LABELS,
  NO_REPEAT_MAX_DAYS,
  ORDERS,
  ORDER_LABEL,
  PlanSchema,
  normalizePlan,
  type AutopilotPlan,
  type AutopilotSlot,
} from "@/lib/status-autopilot"
import shared from "./ContactsTab.module.css"
import styles from "./AutopilotTab.module.css"

interface Card {
  id: string
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  mediaItemId: string | null
}

interface Upcoming extends Omit<Card, "id"> {
  id: string
  status: "scheduled" | "posting" | "cancelled"
  scheduledAt: string
  aiNote: string | null
}

interface Preset {
  id: string
  name: string
  description: string
  plan: AutopilotPlan
  lines: string[]
}

interface AutopilotData {
  autopilot: {
    enabled: boolean
    pausedReason: string | null
    mode: string
    instructions: string | null
    plan: AutopilotPlan
    lines: string[]
  } | null
  gallery: { total: number; byKind: Record<StatusKind, number>; tags: Array<{ tag: string; count: number }> }
  suggested: { plan: AutopilotPlan; lines: string[] }
  presets: Preset[]
  preview: { warnings: string[]; weekCredits: number }
  upcoming: Upcoming[]
}

interface Draft {
  plan: AutopilotPlan
  mode: string
  instructions: string | null
  notes: string[]
  unsupported: string[]
  question: string | null
}

interface DraftPreview {
  lines: string[]
  warnings: string[]
  weekCredits: number
  posts: Array<{ key: string; at: string; card: Card | null; repeat: boolean }>
}

const KIND_LABEL: Record<StatusKind, string> = { text: "Text", image: "Image", video: "Video" }

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong. Please try again.")
  return data
}

function dayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function monthly(weekCredits: number): number {
  return Math.round((weekCredits * 30) / 7)
}

export function AutopilotTab({ agentId, isConnected }: { agentId: string; isConnected: boolean }) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)

  const queryKey = ["status-autopilot", agentId]
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => send<AutopilotData>(`/api/agents/${agentId}/status-autopilot`, "GET"),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  async function run<T>(work: () => Promise<T>, success?: string): Promise<T | null> {
    setBusy(true)
    try {
      const out = await work()
      if (success) showToast(success)
      return out
    } catch (err) {
      showToast((err as Error).message, "error")
      return null
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  if (isLoading) return <div className={shared.empty}>Loading Autopilot…</div>
  if (error || !data) return <div className={shared.empty}>{(error as Error)?.message ?? "Couldn't load Autopilot."}</div>

  const startDraft = (plan: AutopilotPlan, mode: string, extra: Partial<Draft> = {}) => {
    setChoosing(false)
    setDraft({ plan, mode, instructions: null, notes: [], unsupported: [], question: null, ...extra })
  }

  if (draft) {
    return (
      <DraftEditor
        agentId={agentId}
        draft={draft}
        tags={data.gallery.tags.map((t) => t.tag)}
        existing={data.autopilot}
        busy={busy}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={async (enabled) => {
          const out = await run(
            () => send<{ dropped: string[]; paused: string | null }>(`/api/agents/${agentId}/status-autopilot`, "PUT", {
              plan: draft.plan,
              mode: draft.mode,
              instructions: draft.instructions,
              enabled,
            }),
            enabled ? "Autopilot is on. Your next week is planned below." : "Plan saved. Autopilot is off.",
          )
          if (out) setDraft(null)
        }}
      />
    )
  }

  if (!data.autopilot || choosing) {
    return (
      <Chooser
        data={data}
        busy={busy}
        onBack={data.autopilot ? () => setChoosing(false) : undefined}
        onPick={startDraft}
        onInterpret={async (instructions) => {
          const out = await run(() => send<Draft & { preview: unknown }>(`/api/agents/${agentId}/status-autopilot/interpret`, "POST", { instructions }))
          if (out) startDraft(out.plan, "custom", { instructions, notes: out.notes, unsupported: out.unsupported, question: out.question })
        }}
      />
    )
  }

  const ap = data.autopilot
  const on = ap.enabled && !ap.pausedReason

  return (
    <div className={shared.wrap}>
      <section className={shared.card}>
        <div className={shared.switchRow}>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Autopilot"
            disabled={busy || (!on && !isConnected)}
            className={`${shared.switch} ${on ? shared.switchOn : ""}`}
            onClick={() => void run(
              () => send(`/api/agents/${agentId}/status-autopilot`, "PATCH", { enabled: !on }),
              on ? "Autopilot is off. Nothing more will be posted." : "Autopilot is back on.",
            )}
          >
            <span className={shared.switchKnob} />
          </button>
          <div className={styles.grow}>
            <div className={shared.cardTitle}>{on ? "Autopilot is on" : ap.pausedReason ? "Autopilot paused itself" : "Autopilot is off"}</div>
            <div className={shared.cardDesc}>
              {on
                ? `Posting from your gallery on the plan below. About ${data.preview.weekCredits.toLocaleString()} credits a week (${monthly(data.preview.weekCredits).toLocaleString()} a month).`
                : ap.pausedReason ?? "Turn it on to plan the next week from your gallery."}
            </div>
          </div>
        </div>
        {!isConnected && <div className={shared.warn}>Your WhatsApp number isn&apos;t connected, so posts can&apos;t go out.</div>}
      </section>

      <section className={shared.card}>
        <div className={shared.cardRow}>
          <div className={shared.cardTitle}>Your plan</div>
          <div className={shared.actions}>
            <Button type="button" size="sm" variant="secondary" onClick={() => startDraft(ap.plan, ap.mode, { instructions: ap.instructions })}>
              Edit plan
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChoosing(true)}>Pick another</Button>
          </div>
        </div>
        <ul className={shared.facts}>
          {ap.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <ChangeInWords
          busy={busy}
          onSubmit={async (instructions) => {
            const out = await run(() => send<Draft>(`/api/agents/${agentId}/status-autopilot/interpret`, "POST", { instructions, fromCurrent: true }))
            if (out) startDraft(out.plan, "custom", { instructions, notes: out.notes, unsupported: out.unsupported, question: out.question })
          }}
        />
      </section>

      {data.preview.warnings.map((w) => <div key={w} className={shared.warn}>{w}</div>)}

      <UpcomingList
        agentId={agentId}
        posts={data.upcoming}
        busy={busy}
        enabled={on}
        onAction={(post, action) => void run(
          () => send(`/api/agents/${agentId}/status-autopilot/posts/${post.id}`, "POST", { action }),
          action === "skip" ? "Skipped." : action === "unskip" ? "Back in the plan." : "Swapped for another post.",
        )}
      />
    </div>
  )
}

function Chooser({
  data,
  busy,
  onBack,
  onPick,
  onInterpret,
}: {
  data: AutopilotData
  busy: boolean
  onBack?: () => void
  onPick: (plan: AutopilotPlan, mode: string) => void
  onInterpret: (instructions: string) => Promise<void>
}) {
  const [words, setWords] = useState("")
  const g = data.gallery

  return (
    <div className={shared.wrap}>
      <p className={shared.lead}>
        Autopilot posts from your gallery for you, on a plan you choose. Start from a suggestion, pick a ready-made plan, or say how you
        want it to work. You can check and change everything before it starts.
      </p>
      {g.total === 0 && (
        <div className={shared.warn}>Your gallery is empty. Post something or save it to your gallery first, so Autopilot has something to post.</div>
      )}
      {onBack && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={onBack}>Back to my plan</Button>
        </div>
      )}

      <section className={`${shared.card} ${styles.highlight}`}>
        <div className={shared.cardRow}>
          <div>
            <div className={shared.cardTitle}>Suggested for you</div>
            <div className={shared.cardDesc}>
              Based on the {g.total} {g.total === 1 ? "post" : "posts"} in your gallery ({g.byKind.video} videos, {g.byKind.image} images,{" "}
              {g.byKind.text} text).
            </div>
          </div>
          <Button type="button" size="sm" disabled={busy} onClick={() => onPick(data.suggested.plan, "suggested")}>Use this</Button>
        </div>
        <ul className={shared.facts}>
          {data.suggested.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className={shared.card}>
        <div className={shared.cardTitle}>Say how you want it to work</div>
        <div className={shared.cardDesc}>
          For example: &quot;Post my ankara videos every morning, prices on Friday evening, nothing on Sunday, and repeat my best sellers once
          a week.&quot;
        </div>
        <textarea
          className={styles.textarea}
          value={words}
          maxLength={1000}
          rows={3}
          placeholder="Tell Autopilot what to post and when"
          aria-label="Your instructions for Autopilot"
          onChange={(e) => setWords(e.target.value)}
        />
        <div>
          <Button type="button" size="sm" loading={busy} disabled={words.trim().length < 3} onClick={() => void onInterpret(words.trim())}>
            Make my plan
          </Button>
        </div>
      </section>

      <div className={shared.sectionTitle}>Or start from a ready-made plan</div>
      <div className={styles.presets}>
        {data.presets.map((p) => (
          <button key={p.id} type="button" className={styles.preset} disabled={busy} onClick={() => onPick(p.plan, `preset:${p.id}`)}>
            <span className={shared.cardTitle}>{p.name}</span>
            <span className={shared.cardDesc}>{p.description}</span>
          </button>
        ))}
      </div>
      {g.tags.length === 0 && (
        <p className={shared.muted}>
          Tip: add tags like &quot;ankara&quot; or &quot;offer&quot; to your posts in the Gallery tab, so Autopilot can post certain things at certain times.
        </p>
      )}
    </div>
  )
}

function ChangeInWords({ busy, onSubmit }: { busy: boolean; onSubmit: (words: string) => Promise<void> }) {
  const [words, setWords] = useState("")
  return (
    <div className={styles.inline}>
      <input
        className={`${shared.input} ${styles.wide}`}
        value={words}
        maxLength={1000}
        placeholder={'Change it in your own words, e.g. "no posts this Sunday"'}
        aria-label="Change the plan in your own words"
        onChange={(e) => setWords(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && words.trim().length >= 3) void onSubmit(words.trim())
        }}
      />
      <Button type="button" size="sm" variant="secondary" loading={busy} disabled={words.trim().length < 3} onClick={() => void onSubmit(words.trim())}>
        Change
      </Button>
    </div>
  )
}

function DraftEditor({
  agentId,
  draft,
  tags,
  existing,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  agentId: string
  draft: Draft
  tags: string[]
  existing: AutopilotData["autopilot"]
  busy: boolean
  onChange: (d: Draft) => void
  onCancel: () => void
  onSave: (enabled: boolean) => Promise<void>
}) {
  const plan = draft.plan
  const setPlan = (next: AutopilotPlan) => onChange({ ...draft, plan: next })
  const setSlot = (i: number, patch: Partial<AutopilotSlot>) => setPlan({ ...plan, slots: plan.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const valid = PlanSchema.safeParse(plan)
  const dropped = useMemo(() => (valid.success ? normalizePlan(plan).dropped : []), [plan, valid.success])
  const preview = useDraftPreview(agentId, valid.success ? plan : null)

  return (
    <div className={shared.wrap}>
      <section className={shared.card}>
        <div className={shared.cardTitle}>{existing ? "Edit your plan" : "Check your plan"}</div>
        {draft.instructions && <p className={shared.muted}>From what you wrote: &quot;{draft.instructions}&quot;</p>}
        {draft.question && <div className={shared.warn}>{draft.question}</div>}
        {draft.unsupported.map((u) => <div key={u} className={shared.warn}>{u}</div>)}
        {draft.notes.map((n) => <p key={n} className={shared.muted}>{n}</p>)}

        <div className={styles.slots}>
          {plan.slots.map((slot, i) => (
            <SlotRow
              key={i}
              slot={slot}
              tags={tags}
              onChange={(patch) => setSlot(i, patch)}
              onRemove={plan.slots.length > 1 ? () => setPlan({ ...plan, slots: plan.slots.filter((_, j) => j !== i) }) : undefined}
            />
          ))}
        </div>
        <div className={styles.inline}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={plan.slots.length >= AUTOPILOT_MAX_SLOTS}
            onClick={() => setPlan({ ...plan, slots: [...plan.slots, { time: "12:00", days: [1, 2, 3, 4, 5, 6], kinds: [], tags: [], order: "rotate" }] })}
          >
            Add a time
          </Button>
          <label className={styles.field}>
            <span>Don&apos;t repeat a post within</span>
            <input
              type="number"
              className={`${shared.input} ${styles.narrow}`}
              min={0}
              max={NO_REPEAT_MAX_DAYS}
              value={plan.noRepeatDays}
              onChange={(e) => setPlan({ ...plan, noRepeatDays: Math.max(0, Math.min(NO_REPEAT_MAX_DAYS, Math.floor(Number(e.target.value) || 0))) })}
            />
            <span>days</span>
          </label>
        </div>
        {plan.skipDates.length > 0 && (
          <p className={shared.muted}>
            No posts on {plan.skipDates.join(", ")}.{" "}
            <button type="button" className={styles.linkBtn} onClick={() => setPlan({ ...plan, skipDates: [] })}>Clear</button>
          </p>
        )}
        {!valid.success && <p className={shared.error}>{valid.error.issues[0]?.message}</p>}
        {dropped.map((d) => <p key={d} className={shared.error}>Will be left out: {d}</p>)}
      </section>

      <section className={shared.card}>
        <div className={shared.cardTitle}>Next 7 days</div>
        {!preview ? (
          <p className={shared.muted}>Working out the week…</p>
        ) : (
          <>
            <p className={shared.cardDesc}>
              {preview.posts.length} {preview.posts.length === 1 ? "post" : "posts"}, about {preview.weekCredits.toLocaleString()} credits a week
              ({monthly(preview.weekCredits).toLocaleString()} a month). Each post costs the same as posting it yourself.
            </p>
            {preview.warnings.map((w) => <div key={w} className={shared.warn}>{w}</div>)}
            <ul className={styles.list}>
              {preview.posts.slice(0, 21).map((p) => (
                <li key={p.key} className={styles.row}>
                  <span className={styles.when}>{new Date(p.at).toLocaleDateString(undefined, { weekday: "short" })} {clock(p.at)}</span>
                  {p.card ? <CardSummary agentId={agentId} card={p.card} /> : <span className={shared.muted}>Nothing fits, skipped</span>}
                  {p.repeat && <span className={styles.badge}>Repeat</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className={shared.actions}>
        {existing ? (
          <Button type="button" loading={busy} disabled={!valid.success} onClick={() => void onSave(existing.enabled)}>Save changes</Button>
        ) : (
          <>
            <Button type="button" loading={busy} disabled={!valid.success} onClick={() => void onSave(true)}>Turn on Autopilot</Button>
            <Button type="button" variant="secondary" disabled={busy || !valid.success} onClick={() => void onSave(false)}>Save, don&apos;t start yet</Button>
          </>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// Asks the server what a draft would post, a moment after the owner stops editing.
function useDraftPreview(agentId: string, plan: AutopilotPlan | null): DraftPreview | null {
  const [preview, setPreview] = useState<DraftPreview | null>(null)
  const key = plan ? JSON.stringify(plan) : null
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const t = setTimeout(() => {
      send<DraftPreview>(`/api/agents/${agentId}/status-autopilot/preview`, "POST", { plan: JSON.parse(key) })
        .then((p) => { if (!cancelled) setPreview(p) })
        .catch(() => { if (!cancelled) setPreview(null) })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [agentId, key])
  return preview
}

function SlotRow({
  slot,
  tags,
  onChange,
  onRemove,
}: {
  slot: AutopilotSlot
  tags: string[]
  onChange: (patch: Partial<AutopilotSlot>) => void
  onRemove?: () => void
}) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  // Tags in the plan that aren't on any card any more still show, so they can be removed.
  const tagChoices = [...new Set([...tags, ...slot.tags])]

  return (
    <div className={styles.slot}>
      <div className={styles.inline}>
        <input
          type="time"
          className={`${shared.input} ${styles.narrow}`}
          value={slot.time}
          aria-label="Time"
          onChange={(e) => e.target.value && onChange({ time: e.target.value })}
        />
        <div className={styles.chips} role="group" aria-label="Days">
          {DAY_LABELS.map((label, d) => (
            <button
              key={label}
              type="button"
              aria-pressed={slot.days.includes(d)}
              className={`${styles.chip} ${slot.days.includes(d) ? styles.chipOn : ""}`}
              onClick={() => onChange({ days: toggle(slot.days, d).sort((a, b) => a - b) })}
            >
              {label}
            </button>
          ))}
        </div>
        {onRemove && (
          <button type="button" className={styles.linkBtn} onClick={onRemove}>Remove</button>
        )}
      </div>
      <div className={styles.inline}>
        <span className={shared.muted}>Post</span>
        <div className={styles.chips} role="group" aria-label="Types">
          {(["video", "image", "text"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={slot.kinds.includes(k)}
              className={`${styles.chip} ${slot.kinds.includes(k) ? styles.chipOn : ""}`}
              onClick={() => onChange({ kinds: toggle(slot.kinds, k) })}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <select
          className={`${shared.input} ${styles.select}`}
          value={slot.order}
          aria-label="Which first"
          onChange={(e) => onChange({ order: e.target.value as AutopilotSlot["order"] })}
        >
          {ORDERS.map((o) => <option key={o} value={o}>{ORDER_LABEL[o]}</option>)}
        </select>
      </div>
      {tagChoices.length > 0 && (
        <div className={styles.inline}>
          <span className={shared.muted}>Only tagged</span>
          <div className={styles.chips} role="group" aria-label="Tags">
            {tagChoices.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={slot.tags.includes(t)}
                className={`${styles.chip} ${slot.tags.includes(t) ? styles.chipOn : ""}`}
                onClick={() => onChange({ tags: toggle(slot.tags, t) })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className={shared.muted}>
        {slot.kinds.length === 0 ? "Any type" : slot.kinds.map((k) => KIND_LABEL[k].toLowerCase()).join(" or ")}
        {slot.tags.length ? `, tagged ${slot.tags.join(" or ")}` : ", any tag"}
      </p>
    </div>
  )
}

function CardSummary({ agentId, card }: { agentId: string; card: Card & { aiNote?: string | null } }) {
  const label = card.text || card.aiNote || `${KIND_LABEL[card.kind]} post`
  return (
    <span className={styles.cardSummary}>
      {card.kind === "text" ? (
        <span className={styles.thumb} style={{ background: card.backgroundColor ?? undefined }} aria-hidden />
      ) : card.mediaItemId && card.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.thumb} src={mediaPreviewUrl(agentId, card.mediaItemId)} alt="" loading="lazy" />
      ) : (
        <span className={`${styles.thumb} ${styles.thumbVideo}`} aria-hidden>▶</span>
      )}
      <span className={styles.cardText}>
        <span className={shared.muted}>{KIND_LABEL[card.kind]}</span>
        <span className={styles.ellipsis}>{label}</span>
      </span>
    </span>
  )
}

function UpcomingList({
  agentId,
  posts,
  busy,
  enabled,
  onAction,
}: {
  agentId: string
  posts: Upcoming[]
  busy: boolean
  enabled: boolean
  onAction: (post: Upcoming, action: "skip" | "unskip" | "swap") => void
}) {
  const days = new Map<string, Upcoming[]>()
  for (const p of posts) {
    const k = new Date(p.scheduledAt).toDateString()
    days.set(k, [...(days.get(k) ?? []), p])
  }

  return (
    <section className={shared.card}>
      <div className={shared.cardTitle}>Next 7 days</div>
      {posts.length === 0 ? (
        <p className={shared.muted}>{enabled ? "Nothing planned yet. Check the warnings above." : "Turn Autopilot on to plan the week."}</p>
      ) : (
        [...days.values()].map((list) => (
          <div key={list[0].scheduledAt} className={styles.day}>
            <div className={shared.sectionTitle}>{dayHeading(list[0].scheduledAt)}</div>
            <ul className={styles.list}>
              {list.map((p) => (
                <li key={p.id} className={`${styles.row} ${p.status === "cancelled" ? styles.skipped : ""}`}>
                  <span className={styles.when}>{clock(p.scheduledAt)}</span>
                  <CardSummary agentId={agentId} card={p} />
                  <span className={styles.rowActions}>
                    {p.status === "scheduled" && (
                      <>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAction(p, "swap")}>Swap</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAction(p, "skip")}>Skip</Button>
                      </>
                    )}
                    {p.status === "cancelled" && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAction(p, "unskip")}>Undo skip</Button>
                    )}
                    {p.status === "posting" && <span className={shared.muted}>Posting…</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <p className={shared.muted}>
        Each post goes out a few minutes after its set time, so it doesn&apos;t look automated. Autopilot pauses itself if 2 posts in a row fail.
      </p>
    </section>
  )
}
