"use client"

import { useCallback, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import Button from "@/components/ui/Button"
import styles from "./MetaAccountClient.module.css"

// One card per approved Meta permission, each opening a modal that fetches live
// from Graph on demand — App Review needs each permission demonstrably in use,
// and a reviewer can click exactly one thing per permission rather than hunting
// down a scrolling page. (A business_management portfolio card lived here until
// that permission was dropped from the submission; see git history.)

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

type Panel = "account" | null

export function MetaAccountClient() {
  const [open, setOpen] = useState<Panel>(null)
  const [account, setAccount] = useState<BusinessOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tplName, setTplName] = useState("")
  const [tplBody, setTplBody] = useState("")
  const [tplCategory, setTplCategory] = useState<"UTILITY" | "MARKETING">("UTILITY")
  const [tplBusy, setTplBusy] = useState(false)
  const [tplError, setTplError] = useState<string | null>(null)
  const [tplStatus, setTplStatus] = useState<string | null>(null)

  // Fetches on open rather than on mount: each call spends Graph quota, and a
  // reviewer clicking the button should visibly trigger the request.
  const openPanel = useCallback(async (panel: Exclude<Panel, null>) => {
    setOpen(panel)
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/meta/business", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) setError(data.error || "Lookup failed")
      else setAccount(data as BusinessOverview)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault()
    setTplBusy(true)
    setTplError(null)
    setTplStatus(null)
    try {
      const res = await fetch("/api/meta/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tplName, body: tplBody, category: tplCategory }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTplError(data.error || "Template creation failed")
        return
      }
      setTplStatus(`Submitted to Meta for review — status ${data.template.status}.`)
      setTplName("")
      setTplBody("")
      // Re-read so the new template shows in the list above without a reload.
      openPanel("account")
    } catch (err) {
      setTplError(err instanceof Error ? err.message : "Template creation failed")
    } finally {
      setTplBusy(false)
    }
  }

  return (
    <>
      <div className={styles.cards}>
        <article className={styles.card}>
          <div>
            <h2 className={styles.cardTitle}>WhatsApp Business Account</h2>
            <p className={styles.cardText}>
              The WhatsApp Business Account connected to your agent — its phone numbers,
              quality ratings, verification status and approved message templates.
            </p>
            <code className={styles.scope}>whatsapp_business_management</code>
          </div>
          <Button onClick={() => openPanel("account")}>View account details</Button>
        </article>
      </div>

      <Modal
        open={open === "account"}
        onClose={() => setOpen(null)}
        title="WhatsApp Business Account"
      >
        {loading && <p className={styles.muted}>Loading from the WhatsApp Business API…</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && account && (
          <>
            <div className={styles.metaRow}>
              <strong>{account.account.name}</strong>
              <code className={styles.id}>WABA {account.account.id}</code>
            </div>

            <h3 className={styles.sectionTitle}>Phone numbers</h3>
            <div className={styles.tableWrap}>
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
                  {account.phoneNumbers.map((n) => (
                    <tr key={n.id}>
                      <td>{n.displayPhoneNumber}</td>
                      <td>{n.verifiedName}</td>
                      <td>{n.qualityRating ?? "—"}</td>
                      <td>{n.verificationStatus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={styles.sectionTitle}>
              Message templates ({account.templates.length})
            </h3>
            {account.templates.length === 0 ? (
              <p className={styles.muted}>No templates on this account yet.</p>
            ) : (
              <div className={styles.tableWrap}>
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
                    {account.templates.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>{t.category}</td>
                        <td>{t.language}</td>
                        <td>{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.sectionTitle}>Create a template</h3>
            <p className={styles.muted}>
              Templates are how you message a customer outside the 24-hour window. Meta
              reviews each one before it can be sent.
            </p>
            <form className={styles.tplForm} onSubmit={handleCreateTemplate}>
              <div className={styles.tplRow}>
                <label className={styles.tplField}>
                  <span className={styles.tplLabel}>Name</span>
                  <input
                    className={styles.tplInput}
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="order_update"
                  />
                </label>
                <label className={styles.tplField}>
                  <span className={styles.tplLabel}>Category</span>
                  <select
                    className={styles.tplInput}
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as "UTILITY" | "MARKETING")}
                  >
                    <option value="UTILITY">Utility</option>
                    <option value="MARKETING">Marketing</option>
                  </select>
                </label>
              </div>
              <label className={styles.tplField}>
                <span className={styles.tplLabel}>Message body</span>
                <textarea
                  className={`${styles.tplInput} ${styles.tplTextarea}`}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  rows={3}
                  placeholder="Hi! Your order is on its way and should arrive today."
                />
              </label>
              <Button disabled={tplBusy || !tplName.trim() || !tplBody.trim()}>
                {tplBusy ? "Submitting…" : "Create template"}
              </Button>
            </form>
            {tplError && <p className={styles.error}>{tplError}</p>}
            {tplStatus && <p className={styles.muted}>{tplStatus}</p>}
          </>
        )}
      </Modal>
    </>
  )
}
