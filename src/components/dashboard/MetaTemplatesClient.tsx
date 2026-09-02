"use client"

import { useCallback, useEffect, useState } from "react"
import Button from "@/components/ui/Button"
import styles from "./MetaTemplatesClient.module.css"

interface Template {
  id: string
  name: string
  status: string
  category: string
  language: string
  qualityScore: string | null
  rejectedReason: string | null
  body: string | null
}

// Meta's statuses, grouped by what an operator can actually do about them.
const SENDABLE = new Set(["APPROVED"])
const PENDING = new Set(["PENDING", "IN_APPEAL", "PENDING_DELETION"])

function statusClass(status: string): string {
  if (SENDABLE.has(status)) return styles.badgeOk
  if (PENDING.has(status)) return styles.badgePending
  return styles.badgeBad
}

export function MetaTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [after, setAfter] = useState<string | null>(null)
  const [account, setAccount] = useState<{ displayPhoneNumber: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [body, setBody] = useState("")
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY")
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // `cursor` null loads the first page and replaces the list; a cursor appends,
  // so "Load more" doesn't discard what's already on screen.
  const load = useCallback(async (cursor: string | null = null) => {
    setLoading(true)
    setError(null)
    try {
      const url = cursor
        ? `/api/meta/templates?after=${encodeURIComponent(cursor)}`
        : "/api/meta/templates"
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Couldn't load templates")
        return
      }
      setTemplates((prev) => (cursor ? [...prev, ...data.templates] : data.templates))
      setAfter(data.after ?? null)
      setAccount(data.account ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load templates")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(null)
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/meta/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, body, category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Couldn't create the template")
        return
      }
      setNotice(`Submitted for review — status ${data.template.status}.`)
      setName("")
      setBody("")
      load(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the template")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(templateName: string) {
    // Meta deletes every language variant sharing the name — say so before asking.
    const ok = window.confirm(
      `Delete "${templateName}"?\n\nThis removes every language version of it, and cannot be undone.`
    )
    if (!ok) return

    setDeleting(templateName)
    setError(null)
    try {
      const res = await fetch(`/api/meta/templates?name=${encodeURIComponent(templateName)}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || "Couldn't delete the template")
      else {
        setNotice(`Deleted "${templateName}".`)
        load(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the template")
    } finally {
      setDeleting(null)
    }
  }

  const approved = templates.filter((t) => SENDABLE.has(t.status)).length

  return (
    <>
      <section className={styles.panel}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>
              Your templates {templates.length > 0 && <span className={styles.count}>
                {approved} of {templates.length} approved
              </span>}
            </h2>
            {account?.displayPhoneNumber && (
              <p className={styles.sub}>On {account.displayPhoneNumber}</p>
            )}
          </div>
          <Button variant="secondary" onClick={() => load(null)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </header>

        {error && <p className={styles.error}>{error}</p>}
        {notice && <p className={styles.notice}>{notice}</p>}

        {!loading && templates.length === 0 && !error && (
          <p className={styles.empty}>
            No templates yet. Create one below — Meta usually reviews within a few hours.
          </p>
        )}

        {templates.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Message</th>
                  <th>Category</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className={styles.nameCell}>{t.name}</td>
                    <td className={styles.bodyCell} title={t.body ?? ""}>
                      {t.body ?? "—"}
                    </td>
                    <td>{t.category}</td>
                    <td>{t.language}</td>
                    <td>
                      <span className={`${styles.badge} ${statusClass(t.status)}`}>
                        {t.status}
                      </span>
                      {t.rejectedReason && (
                        <span className={styles.reason}>{t.rejectedReason}</span>
                      )}
                    </td>
                    <td>{t.qualityScore ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(t.name)}
                        disabled={deleting === t.name}
                      >
                        {deleting === t.name ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {after && (
          <div className={styles.more}>
            <Button variant="secondary" onClick={() => load(after)} disabled={loading}>
              Load more
            </Button>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>Create a template</h2>
        <p className={styles.sub}>
          Names are lowercased and spaces become underscores. Meta reviews every template
          before it can be sent.
        </p>
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="order_update"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Category</span>
              <select
                className={styles.input}
                value={category}
                onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")}
              >
                <option value="UTILITY">Utility — order updates, reminders</option>
                <option value="MARKETING">Marketing — offers, promotions</option>
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Message body</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Hi! Your order is on its way and should arrive today."
            />
          </label>
          <Button disabled={creating || !name.trim() || !body.trim()}>
            {creating ? "Submitting…" : "Create template"}
          </Button>
        </form>
      </section>
    </>
  )
}
