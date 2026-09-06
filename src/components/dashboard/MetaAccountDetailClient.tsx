"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Button from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { DropdownMenu, type DropdownItem } from "@/components/ui/DropdownMenu"
import styles from "./MetaAccountDetailClient.module.css"

export interface MetaConnectionDetail {
  phoneNumberId: string
  wabaId: string
  businessId: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
  agentId: string | null
  agentName: string | null
  aiRepliesEnabled: boolean
  typingIndicator: boolean
  registeredAt: string | null
  subscribedAt: string | null
}

interface NumberStatus {
  messagingLimitTier: string | null
  qualityRating: string | null
  nameStatus: string | null
  codeVerificationStatus: string | null
  accountReviewStatus: string | null
}

interface Props {
  connection: MetaConnectionDetail
  agents: Array<{ id: string; businessName: string }>
}

// TIER_1K reads as noise in a UI; "1,000 / 24h" is the thing the operator
// actually wants to know. Unrecognised values pass through rather than being
// swallowed, so a new tier Meta invents still shows something truthful.
function formatTier(tier: string | null): string {
  if (!tier) return "Unknown"
  const match = /^TIER_(\d+)([KM]?)$/.exec(tier)
  if (!match) return tier
  const [, digits, scale] = match
  const n = Number(digits) * (scale === "K" ? 1_000 : scale === "M" ? 1_000_000 : 1)
  return `${n.toLocaleString()} customers / 24h`
}

function whatsappManagerUrl(c: MetaConnectionDetail): string {
  const params = new URLSearchParams({ waba_id: c.wabaId })
  if (c.businessId) params.set("business_id", c.businessId)
  return `https://business.facebook.com/wa/manage/phone-numbers/?${params}`
}

export function MetaAccountDetailClient({ connection, agents }: Props) {
  const router = useRouter()
  const [agentId, setAgentId] = useState(connection.agentId ?? "")
  const [aiReplies, setAiReplies] = useState(connection.aiRepliesEnabled)
  const [typing, setTyping] = useState(connection.typingIndicator)
  const [status, setStatus] = useState<NumberStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Live from Graph on mount. Separate from the server-rendered connection
  // because it's a network call to Meta that can fail on its own — the page
  // stays useful when it does.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/meta/connections/${connection.phoneNumberId}/status`,
          { cache: "no-store" }
        )
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) setStatusError(data.error || "Couldn’t reach Meta")
        else setStatus(data as NumberStatus)
      } catch {
        if (!cancelled) setStatusError("Couldn’t reach Meta")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connection.phoneNumberId])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [notice])

  // Saves one field at a time, on change — there is no Save button, so a failed
  // write must put the control back where it was rather than leaving the UI
  // claiming a setting that isn't stored.
  const save = useCallback(
    async (patch: Record<string, unknown>, revert: () => void, message: string) => {
      setSaveError(null)
      try {
        const res = await fetch(`/api/meta/connections/${connection.phoneNumberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Save failed")
        setNotice(message)
        router.refresh()
      } catch (err) {
        revert()
        setSaveError(err instanceof Error ? err.message : "Save failed")
      }
    },
    [connection.phoneNumberId, router]
  )

  const onAgentChange = (next: string) => {
    const previous = agentId
    setAgentId(next)
    void save(
      { agentId: next || null },
      () => setAgentId(previous),
      next ? "Agent assigned" : "Agent detached"
    )
  }

  const onToggle = (
    key: "aiRepliesEnabled" | "typingIndicator",
    next: boolean,
    setter: (v: boolean) => void,
    label: string
  ) => {
    setter(next)
    void save({ [key]: next }, () => setter(!next), `${label} ${next ? "on" : "off"}`)
  }

  const remove = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/meta/connections/${connection.phoneNumberId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      router.push("/dashboard/meta")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed")
      setBusy(false)
      setDeleteOpen(false)
    }
  }, [connection.phoneNumberId, router])

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`${what} copied`)
    } catch {
      setNotice("Couldn’t copy — your browser blocked clipboard access")
    }
  }

  const menu: DropdownItem[] = [
    {
      label: "Copy business account ID",
      onSelect: () => void copy(connection.wabaId, "Business account ID"),
    },
    {
      label: "Copy phone number ID",
      onSelect: () => void copy(connection.phoneNumberId, "Phone number ID"),
    },
    {
      label: "WhatsApp Manager",
      external: true,
      onSelect: () => window.open(whatsappManagerUrl(connection), "_blank", "noopener"),
    },
    { label: "Delete account", destructive: true, onSelect: () => setDeleteOpen(true) },
  ]

  const verified = connection.registeredAt !== null && connection.subscribedAt !== null

  return (
    <>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/dashboard/meta">WhatsApp accounts</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{connection.verifiedName ?? connection.phoneNumberId}</span>
      </nav>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {connection.verifiedName ?? "Unnamed account"}
            {verified && (
              <span className={styles.verified} title="Registered and receiving webhooks">
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M6 10.2l2.6 2.6L14 7.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={styles.srOnly}>Registered and receiving webhooks</span>
              </span>
            )}
          </h1>
          <p className={styles.sub}>{connection.verifiedName ?? "—"}</p>
          <p className={styles.number}>
            {connection.displayPhoneNumber ?? connection.phoneNumberId}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/dashboard/meta/templates" className={styles.secondaryLink}>
            Message templates
          </Link>
          <DropdownMenu items={menu} label="Account actions" />
        </div>
      </div>

      {saveError && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>

      <section className={styles.card} aria-labelledby="agent-heading">
        <div className={styles.cardRow}>
          <div>
            <h2 id="agent-heading" className={styles.cardTitle}>
              Agent
            </h2>
            <p className={styles.cardText}>
              Assign an agent to answer messages sent to this WhatsApp account.
            </p>
          </div>
          <select
            className={styles.select}
            value={agentId}
            aria-label="Agent that answers on this number"
            onChange={(e) => onAgentChange(e.target.value)}
          >
            <option value="">Not assigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.businessName}
              </option>
            ))}
          </select>
        </div>
        {!agentId && (
          <p className={styles.warn}>
            With no agent assigned, messages to this number are dropped rather than answered.
          </p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="settings-heading">
        <h2 id="settings-heading" className={styles.cardTitle}>
          Settings
        </h2>
        <div className={styles.settings}>
          <div className={styles.settingRow}>
            <label className={styles.settingLabel} htmlFor="ai-replies">
              <span className={styles.settingName}>Enable AI replies</span>
              <span className={styles.cardText}>
                Should the agent respond to messages? When off, messages still arrive in
                Conversations for a human to answer — the AI just stays quiet.
              </span>
            </label>
            <input
              id="ai-replies"
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={aiReplies}
              onChange={(e) =>
                onToggle("aiRepliesEnabled", e.target.checked, setAiReplies, "AI replies")
              }
            />
          </div>

          <div className={styles.settingRow}>
            <label className={styles.settingLabel} htmlFor="typing-indicator">
              <span className={styles.settingName}>Enable typing indicator</span>
              <span className={styles.cardText}>
                Mark incoming messages as read and show a typing indicator while the agent
                prepares a reply.
              </span>
            </label>
            <input
              id="typing-indicator"
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={typing}
              onChange={(e) =>
                onToggle("typingIndicator", e.target.checked, setTyping, "Typing indicator")
              }
            />
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="status-heading">
        <h2 id="status-heading" className={styles.cardTitle}>
          Account status
        </h2>
        <p className={styles.cardText}>
          Read live from Meta. The messaging limit is set by the owning business portfolio&rsquo;s
          verification — not by this number&rsquo;s own code verification.
        </p>

        {statusError ? (
          <p className={styles.warn}>{statusError}</p>
        ) : (
          <dl className={styles.statusGrid}>
            <div>
              <dt>Messaging limit</dt>
              <dd>{status ? formatTier(status.messagingLimitTier) : "…"}</dd>
            </div>
            <div>
              <dt>Quality rating</dt>
              <dd>{status ? (status.qualityRating ?? "Unknown") : "…"}</dd>
            </div>
            <div>
              <dt>Display name</dt>
              <dd>{status ? (status.nameStatus ?? "Unknown") : "…"}</dd>
            </div>
            <div>
              <dt>Number verification</dt>
              <dd>{status ? (status.codeVerificationStatus ?? "Unknown") : "…"}</dd>
            </div>
            <div>
              <dt>Account review</dt>
              <dd>{status ? (status.accountReviewStatus ?? "Unknown") : "…"}</dd>
            </div>
          </dl>
        )}

        <dl className={styles.idGrid}>
          <div>
            <dt>Business account ID</dt>
            <dd>
              <code>{connection.wabaId}</code>
            </dd>
          </div>
          <div>
            <dt>Phone number ID</dt>
            <dd>
              <code>{connection.phoneNumberId}</code>
            </dd>
          </div>
        </dl>
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this account?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </>
        }
      >
        <p>
          <strong>{connection.verifiedName ?? connection.displayPhoneNumber}</strong> will stop
          being answered — incoming messages to it are dropped rather than reaching an agent.
        </p>
        <p className={styles.cardText}>
          This only removes the connection here. The number stays registered on the WhatsApp
          Business Platform and can be connected again.
        </p>
      </Modal>
    </>
  )
}
