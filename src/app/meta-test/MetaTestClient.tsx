"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./page.module.css"

interface StoredMessage {
  id: string
  waId: string
  direction: "inbound" | "outbound"
  text: string
  waMessageId: string | null
  createdAt: string
}

interface ConfigStatus {
  graphVersion: string
  phoneNumberId: string | null
  hasAccessToken: boolean
  hasAppSecret: boolean
  hasVerifyToken: boolean
}

interface Persona {
  agentId: string
  businessName: string
}

interface BusinessOverview {
  account: { id: string; name: string; timezoneId: string | null }
  phoneNumbers: Array<{
    id: string
    displayPhoneNumber: string
    verifiedName: string
    qualityRating: string | null
    verificationStatus: string | null
  }>
  templates: Array<{
    id: string
    name: string
    status: string
    category: string
    language: string
  }>
}

interface PortfolioEntry {
  id: string
  name: string
  verificationStatus: string | null
  wabas: Array<{ id: string; name: string }>
  wabaError: string | null
}

const POLL_MS = 1500

export function MetaTestClient() {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [to, setTo] = useState("")
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [business, setBusiness] = useState<BusinessOverview | null>(null)
  const [businessError, setBusinessError] = useState<string | null>(null)
  const [loadingBusiness, setLoadingBusiness] = useState(false)
  const [portfolio, setPortfolio] = useState<PortfolioEntry[] | null>(null)
  const [portfolioError, setPortfolioError] = useState<string | null>(null)
  const [loadingPortfolio, setLoadingPortfolio] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)

  // Pinned to light for screen recording — the app defaults to a very dark
  // palette that washes out under video compression. Restored on unmount so
  // leaving the harness doesn't change the user's theme.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute("data-theme")
    root.setAttribute("data-theme", "light")
    return () => {
      if (previous) root.setAttribute("data-theme", previous)
      else root.removeAttribute("data-theme")
    }
  }, [])

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/meta/webhook`)
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/messages", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setConfig(data.config)
      setPersona(data.persona)
      // Server returns newest-first; show oldest-first like a chat thread.
      setMessages([...(data.messages as StoredMessage[])].reverse())
    } catch {
      // Best-effort poll — a dropped request just retries next tick.
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  // Fetched on demand rather than polled — WABA config barely changes, and each
  // load spends Graph quota on three calls.
  const loadBusiness = useCallback(async () => {
    setLoadingBusiness(true)
    setBusinessError(null)
    try {
      const res = await fetch("/api/meta/business", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) setBusinessError(data.error || "Lookup failed")
      else setBusiness(data as BusinessOverview)
    } catch (err) {
      setBusinessError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setLoadingBusiness(false)
    }
  }, [])

  const loadPortfolio = useCallback(async () => {
    setLoadingPortfolio(true)
    setPortfolioError(null)
    try {
      const res = await fetch("/api/meta/portfolio", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) setPortfolioError(data.error || "Lookup failed")
      else setPortfolio(data.businesses as PortfolioEntry[])
    } catch (err) {
      setPortfolioError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setLoadingPortfolio(false)
    }
  }, [])

  useEffect(() => {
    loadBusiness()
    loadPortfolio()
  }, [loadBusiness, loadPortfolio])

  // Keep the conversation pinned to the latest message.
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const res = await fetch("/api/meta/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Send failed")
      } else {
        setText("")
        poll()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
    } finally {
      setSending(false)
    }
  }

  const ready =
    config?.phoneNumberId &&
    config.hasAccessToken &&
    config.hasAppSecret &&
    config.hasVerifyToken

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Meta Cloud API — Test Harness</h1>
          <p className={styles.subtitle}>
            Official WhatsApp Business Platform · inbound → AI → reply
          </p>
        </div>
        <span className={`${styles.badge} ${ready ? styles.badgeOk : styles.badgeWarn}`}>
          {ready ? "Configured" : "Setup incomplete"}
        </span>
      </header>

      <div className={styles.grid}>
        {/* Conversation */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            Conversation
            {persona && <span className={styles.personaTag}>as {persona.businessName}</span>}
          </h2>
          <div className={styles.feed} ref={feedRef}>
            {messages.length === 0 && (
              <p className={styles.empty}>
                No messages yet. Send a WhatsApp message to your test number, or use the
                composer below to open the 24-hour window.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.bubble} ${
                  m.direction === "inbound" ? styles.inbound : styles.outbound
                }`}
              >
                <span className={styles.bubbleMeta}>
                  {m.direction === "inbound" ? m.waId : "AI"} ·{" "}
                  {new Date(m.createdAt).toLocaleTimeString()}
                </span>
                <span className={styles.bubbleText}>{m.text}</span>
              </div>
            ))}
          </div>

          <form className={styles.composer} onSubmit={handleSend}>
            <input
              className={styles.input}
              placeholder="Recipient (e.g. 2348149113328)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              inputMode="numeric"
            />
            <input
              className={styles.input}
              placeholder="Message text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className={styles.button} disabled={sending || !to || !text}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {/* Config / setup */}
        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Setup</h2>

          <div className={styles.field}>
            <label className={styles.label}>Webhook callback URL</label>
            <code className={styles.code}>{webhookUrl || "…"}</code>
            <span className={styles.hint}>
              Paste this into Meta → WhatsApp → Configuration → Webhook, and subscribe to
              the <strong>messages</strong> field.
            </span>
          </div>

          <ul className={styles.checklist}>
            <ConfigRow ok={!!config?.phoneNumberId} label="Phone number ID" value={config?.phoneNumberId} />
            <ConfigRow ok={!!config?.hasAccessToken} label="Access token" />
            <ConfigRow ok={!!config?.hasAppSecret} label="App secret (signature)" />
            <ConfigRow ok={!!config?.hasVerifyToken} label="Webhook verify token" />
            <ConfigRow ok={!!persona} label="Agent persona" value={persona?.businessName} />
          </ul>

          <div className={styles.field}>
            <label className={styles.label}>Graph version</label>
            <code className={styles.code}>{config?.graphVersion ?? "—"}</code>
          </div>
        </aside>
      </div>

      {/* whatsapp_business_management — read-only WABA config straight from Graph */}
      <section className={`${styles.panel} ${styles.businessPanel}`}>
        <h2 className={styles.panelTitle}>
          Business account
          <span className={styles.scopeTag}>whatsapp_business_management</span>
          <button
            type="button"
            className={styles.refresh}
            onClick={loadBusiness}
            disabled={loadingBusiness}
          >
            {loadingBusiness ? "Loading…" : "Refresh"}
          </button>
        </h2>

        {businessError && <p className={styles.error}>{businessError}</p>}

        {business && (
          <>
            <div className={styles.metaRow}>
              <span>
                <strong>{business.account.name}</strong>
              </span>
              <code className={styles.checkValue}>WABA {business.account.id}</code>
            </div>

            <label className={styles.label}>Phone numbers</label>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Verified name</th>
                  <th>Quality</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {business.phoneNumbers.map((n) => (
                  <tr key={n.id}>
                    <td>{n.displayPhoneNumber}</td>
                    <td>{n.verifiedName}</td>
                    <td>{n.qualityRating ?? "—"}</td>
                    <td>{n.verificationStatus ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <label className={styles.label} style={{ marginTop: "1rem" }}>
              Message templates ({business.templates.length})
            </label>
            {business.templates.length === 0 ? (
              <p className={styles.hint}>No templates on this account yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Language</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {business.templates.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.category}</td>
                      <td>{t.language}</td>
                      <td>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* business_management — which businesses this account administers */}
      <section className={`${styles.panel} ${styles.businessPanel}`}>
        <h2 className={styles.panelTitle}>
          Business portfolio
          <span className={styles.scopeTag}>business_management</span>
          <button
            type="button"
            className={styles.refresh}
            onClick={loadPortfolio}
            disabled={loadingPortfolio}
          >
            {loadingPortfolio ? "Loading…" : "Refresh"}
          </button>
        </h2>

        {portfolioError && <p className={styles.error}>{portfolioError}</p>}

        {portfolio && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Business</th>
                <th>Verification</th>
                <th>Owned WhatsApp accounts</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.name}
                    <br />
                    <code className={styles.checkValue}>{b.id}</code>
                  </td>
                  <td>{b.verificationStatus ?? "—"}</td>
                  <td>
                    {b.wabaError
                      ? b.wabaError
                      : b.wabas.length === 0
                        ? "None"
                        : b.wabas.map((w) => `${w.name} (${w.id})`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function ConfigRow({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
  return (
    <li className={styles.checkRow}>
      <span className={ok ? styles.dotOk : styles.dotBad} />
      <span className={styles.checkLabel}>{label}</span>
      {value && <code className={styles.checkValue}>{value}</code>}
    </li>
  )
}
