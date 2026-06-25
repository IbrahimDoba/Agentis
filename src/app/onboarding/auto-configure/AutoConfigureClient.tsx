"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import styles from "./page.module.css"
import { useVisibleInterval } from "@/lib/useVisibleInterval"
import { useBrand } from "@/components/BrandProvider"

type Status = "pending" | "analyzing" | "ready_for_review" | "activated" | "failed" | "skipped"

interface DraftProduct { name: string; priceRange: string; notes: string }
interface DraftFaq { question: string; answer: string }
interface AutoConfigDraft {
  systemPrompt: string
  description: string
  personality: string
  products: DraftProduct[]
  faqs: DraftFaq[]
  insights: string[]
}
interface DraftError { error: string }
interface AutoConfigPayload {
  status: Status
  startedAt: string | null
  completedAt: string | null
  candidateCount: number
  draft: AutoConfigDraft | DraftError | null
}

const POLL_INTERVAL_MS = 2500

export function AutoConfigureClient({ agentId }: { agentId: string }) {
  const router = useRouter()
  const [payload, setPayload] = useState<AutoConfigPayload | null>(null)
  const [editingDraft, setEditingDraft] = useState<AutoConfigDraft | null>(null)
  const [activating, setActivating] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [triggered, setTriggered] = useState(false)

  const poll = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/auto-configure`)
    if (!res.ok) return
    const data: AutoConfigPayload = await res.json()
    setPayload(data)
    // Once we have a draft, snapshot it into editable state — only the first
    // time, so we don't clobber the user's in-progress edits.
    if (data.status === "ready_for_review" && data.draft && !("error" in data.draft) && !editingDraft) {
      setEditingDraft(data.draft as AutoConfigDraft)
    }
  }, [agentId, editingDraft])

  // Fetch once on mount.
  useEffect(() => {
    poll()
  }, [poll])

  // Keep polling — visible-only, and only until we reach a terminal state.
  const isTerminal =
    payload?.status === "ready_for_review" ||
    payload?.status === "failed" ||
    payload?.status === "activated" ||
    payload?.status === "skipped"
  useVisibleInterval(poll, POLL_INTERVAL_MS, !isTerminal)

  // Auto-trigger the LLM step once inputs are ready and we haven't kicked
  // off the analysis yet. The worker writes autoConfigStatus='analyzing'
  // when the inputs are ready (chat-extractor side); this catches the
  // case where chat-extractor finished but the LLM hasn't been called
  // (e.g. user navigated here directly after history sync).
  useEffect(() => {
    if (triggered) return
    if (!payload) return
    if (payload.status !== "pending" && payload.status !== "analyzing") return
    if (payload.candidateCount === 0) return
    if (payload.draft) return // already a draft or error — no need to re-trigger
    setTriggered(true)
    fetch(`/api/agents/${agentId}/auto-configure`, { method: "POST" }).catch(() => {})
  }, [agentId, payload, triggered])

  const activate = useCallback(async () => {
    if (!editingDraft) return
    setActivating(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/auto-configure/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: editingDraft }),
      })
      if (!res.ok) {
        alert("Couldn't activate. Please try again.")
        return
      }
      router.push(`/dashboard?welcome=1`)
    } finally {
      setActivating(false)
    }
  }, [agentId, editingDraft, router])

  const skipToManual = useCallback(async () => {
    setSkipping(true)
    try {
      await fetch(`/api/agents/${agentId}/auto-configure/skip`, { method: "POST" })
    } finally {
      router.push(`/dashboard/agent/${agentId}`)
    }
  }, [agentId, router])

  // ─── Render branches ───────────────────────────────────────────────
  if (!payload) {
    return <Frame><div className={styles.loading}>Loading…</div></Frame>
  }

  if (payload.status === "failed" || (payload.draft && "error" in payload.draft)) {
    const errorMsg = payload.draft && "error" in payload.draft ? payload.draft.error : "Auto-configure couldn't run."
    const retry = async () => {
      // Reset triggered + clear local payload + repost. The POST also
      // re-runs the worker's chat-extractor against the DB so if more
      // messages have landed since the last attempt, this picks them up.
      setTriggered(false)
      setPayload(null)
      await fetch(`/api/agents/${agentId}/auto-configure`, { method: "POST" }).catch(() => {})
    }
    return (
      <Frame>
        <h1 className={styles.title}>We couldn&apos;t auto-configure your agent</h1>
        <p className={styles.subtitle}>{errorMsg}</p>
        <p className={styles.body}>
          This usually happens when there aren&apos;t enough recent customer chats to learn from yet. You can try again (in case more chats have synced since), set up your agent manually, or skip for now.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={retry}>
            Try again
          </button>
          <Link href={`/dashboard/agent/${agentId}`} className={styles.secondaryBtn}>
            Set up manually
          </Link>
          <Link href="/dashboard" className={styles.secondaryBtn}>Skip for now</Link>
        </div>
      </Frame>
    )
  }

  if (payload.status === "activated") {
    return (
      <Frame>
        <h1 className={styles.title}>Your AI agent is live 🚀</h1>
        <p className={styles.subtitle}>It&apos;s already replying to messages on WhatsApp.</p>
        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.primaryBtn}>Go to dashboard</Link>
        </div>
      </Frame>
    )
  }

  if (payload.status === "skipped") {
    return (
      <Frame>
        <h1 className={styles.title}>Auto-configure skipped</h1>
        <p className={styles.subtitle}>You can finish setting up the agent manually from the dashboard.</p>
        <div className={styles.actions}>
          <Link href={`/dashboard/agent/${agentId}`} className={styles.primaryBtn}>Open manual setup</Link>
        </div>
      </Frame>
    )
  }

  if (payload.status !== "ready_for_review") {
    return <ConfiguringView payload={payload} onSkip={skipToManual} skipping={skipping} />
  }

  // ── Review screen ──
  if (!editingDraft) {
    return <Frame><div className={styles.loading}>Loading draft…</div></Frame>
  }

  return (
    <ReviewView
      draft={editingDraft}
      onChange={setEditingDraft}
      onActivate={activate}
      activating={activating}
      agentId={agentId}
    />
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const brand = useBrand()
  return (
    <div className={styles.root}>
      <div className={styles.brand}><span className={styles.brandDot} /> {brand.appName}</div>
      <div className={styles.card}>{children}</div>
    </div>
  )
}

function ConfiguringView({
  payload,
  onSkip,
  skipping,
}: {
  payload: AutoConfigPayload
  onSkip: () => void
  skipping: boolean
}) {
  const stages = useMemo(() => {
    return [
      { key: "connect", label: "Connected to WhatsApp", done: true },
      { key: "extract", label: `Reading your recent customer chats${payload.candidateCount > 0 ? ` (${payload.candidateCount} found)` : "…"}`, done: payload.candidateCount > 0 },
      { key: "analyze", label: "Studying how you reply", done: payload.status === "ready_for_review" },
      { key: "draft", label: "Drafting your AI agent's personality and FAQs", done: payload.status === "ready_for_review" },
    ]
  }, [payload])

  return (
    <Frame>
      <h1 className={styles.title}>Building your AI agent…</h1>
      <p className={styles.subtitle}>This usually takes about <strong>5 minutes</strong> — please be patient and don&apos;t close this tab. We&apos;re pulling your recent WhatsApp chats and learning how you reply.</p>
      <ul className={styles.stageList}>
        {stages.map((s) => (
          <li key={s.key} className={`${styles.stageItem} ${s.done ? styles.stageDone : styles.stagePending}`}>
            <span className={styles.stageIcon}>{s.done ? "✓" : <span className={styles.spinner} />}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Link href="/dashboard" className={styles.secondaryBtn}>Keep this for later</Link>
        <button type="button" className={styles.secondaryBtn} onClick={onSkip} disabled={skipping}>
          {skipping ? "Skipping…" : "Skip and set up manually"}
        </button>
      </div>
    </Frame>
  )
}

interface ReviewViewProps {
  draft: AutoConfigDraft
  onChange: (d: AutoConfigDraft) => void
  onActivate: () => void
  activating: boolean
  agentId: string
}

function ReviewView({ draft, onChange, onActivate, activating, agentId }: ReviewViewProps) {
  const brand = useBrand()
  return (
    <div className={styles.root}>
      <div className={styles.brand}><span className={styles.brandDot} /> {brand.appName}</div>
      <div className={styles.reviewWrap}>
        <header className={styles.reviewHeader}>
          <h1 className={styles.title}>Review your AI agent</h1>
          <p className={styles.subtitle}>We&apos;ve drafted everything based on your WhatsApp chats. Tweak anything below, then activate.</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Description</h2>
          <textarea
            className={styles.textarea}
            value={draft.description}
            rows={3}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How your AI should behave</h2>
          <p className={styles.sectionDesc}>This is the system prompt the AI follows on every reply.</p>
          <textarea
            className={styles.textarea}
            value={draft.systemPrompt}
            rows={12}
            onChange={(e) => onChange({ ...draft, systemPrompt: e.target.value })}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Personality</h2>
          <textarea
            className={styles.textarea}
            value={draft.personality}
            rows={2}
            onChange={(e) => onChange({ ...draft, personality: e.target.value })}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Products / services we found ({draft.products.length})</h2>
          <ProductsEditor
            products={draft.products}
            onChange={(products) => onChange({ ...draft, products })}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>FAQs we found ({draft.faqs.length})</h2>
          <FaqsEditor
            faqs={draft.faqs}
            onChange={(faqs) => onChange({ ...draft, faqs })}
          />
        </section>

        {draft.insights.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>What we noticed about you</h2>
            <ul className={styles.insightList}>
              {draft.insights.map((i) => (
                <li key={i} className={styles.insightItem}>{i}</li>
              ))}
            </ul>
          </section>
        )}

        <div className={styles.reviewFooter}>
          <Link href={`/dashboard/agent/${agentId}`} className={styles.secondaryBtn}>Tweak more later in dashboard</Link>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onActivate}
            disabled={activating}
          >
            {activating ? "Activating…" : "Activate my AI agent →"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductsEditor({ products, onChange }: {
  products: DraftProduct[]
  onChange: (next: DraftProduct[]) => void
}) {
  const update = (i: number, patch: Partial<DraftProduct>) =>
    onChange(products.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const remove = (i: number) => onChange(products.filter((_, idx) => idx !== i))
  const add = () => onChange([...products, { name: "", priceRange: "", notes: "" }])
  if (products.length === 0) {
    return (
      <div className={styles.emptyEdit}>
        <p>No products auto-detected. Add them manually if useful.</p>
        <button type="button" className={styles.smallBtn} onClick={add}>+ Add product</button>
      </div>
    )
  }
  return (
    <div className={styles.itemList}>
      {products.map((p, i) => (
        <div key={i} className={styles.itemRow}>
          <input
            className={styles.input}
            placeholder="Name"
            value={p.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Price range"
            value={p.priceRange}
            onChange={(e) => update(i, { priceRange: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="Notes"
            value={p.notes}
            onChange={(e) => update(i, { notes: e.target.value })}
          />
          <button type="button" className={styles.removeBtn} onClick={() => remove(i)} title="Remove">✕</button>
        </div>
      ))}
      <button type="button" className={styles.smallBtn} onClick={add}>+ Add product</button>
    </div>
  )
}

function FaqsEditor({ faqs, onChange }: {
  faqs: DraftFaq[]
  onChange: (next: DraftFaq[]) => void
}) {
  const update = (i: number, patch: Partial<DraftFaq>) =>
    onChange(faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const remove = (i: number) => onChange(faqs.filter((_, idx) => idx !== i))
  const add = () => onChange([...faqs, { question: "", answer: "" }])
  if (faqs.length === 0) {
    return (
      <div className={styles.emptyEdit}>
        <p>No FAQs auto-detected. Add the questions customers ask most.</p>
        <button type="button" className={styles.smallBtn} onClick={add}>+ Add FAQ</button>
      </div>
    )
  }
  return (
    <div className={styles.itemList}>
      {faqs.map((f, i) => (
        <div key={i} className={styles.faqRow}>
          <input
            className={styles.input}
            placeholder="Question"
            value={f.question}
            onChange={(e) => update(i, { question: e.target.value })}
          />
          <textarea
            className={styles.textarea}
            placeholder="Answer"
            value={f.answer}
            rows={2}
            onChange={(e) => update(i, { answer: e.target.value })}
          />
          <button type="button" className={styles.removeBtn} onClick={() => remove(i)} title="Remove">✕</button>
        </div>
      ))}
      <button type="button" className={styles.smallBtn} onClick={add}>+ Add FAQ</button>
    </div>
  )
}
