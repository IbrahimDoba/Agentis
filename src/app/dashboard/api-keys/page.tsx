"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import styles from "./page.module.css"
import Button from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useToast } from "@/context/ToastContext"
import {
  KeyIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline"

type Scope = "chat" | "manage"

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  scopes: string[]
  status: string
  dailySpendingCapCredits: number | null
  dailySpentCredits: number
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
}

const SCOPE_INFO: Record<Scope, { label: string; hint: string }> = {
  chat: { label: "Chat", hint: "Run agents (POST /v1/chat/completions). Safe to embed client-side." },
  manage: { label: "Manage", hint: "Create & configure agents (/v1/agents). Keep server-side only." },
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function ApiKeysPage() {
  const { showToast } = useToast()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/api-keys")
      if (!res.ok) throw new Error("Failed to load keys")
      const data = await res.json()
      setKeys(data.keys ?? [])
    } catch {
      showToast("Couldn't load API keys", "error")
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const activeKeys = keys.filter((k) => k.status === "active")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>API keys</h1>
          <p className={styles.subtitle}>
            Use these keys to call your agents from your own apps via the Developer API. Calls are
            billed against the same credits as WhatsApp.{" "}
            <Link href="/developers" target="_blank" rel="noopener noreferrer" className={styles.docsLink}>
              Read the docs →
            </Link>
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <KeyIcon width={16} height={16} /> Create key
        </Button>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading…</div>
      ) : activeKeys.length === 0 ? (
        <div className={styles.empty}>
          <KeyIcon width={28} height={28} />
          <p>No API keys yet. Create one to start calling your agents from code.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Scopes</th>
                <th>Daily cap</th>
                <th>Last used</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((k) => (
                <tr key={k.id}>
                  <td className={styles.nameCell}>{k.name}</td>
                  <td>
                    <code className={styles.prefix}>{k.prefix}…</code>
                  </td>
                  <td>
                    <div className={styles.scopeTags}>
                      {k.scopes.map((s) => (
                        <span key={s} className={styles.scopeTag}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {k.dailySpendingCapCredits === null
                      ? "—"
                      : `${k.dailySpentCredits.toLocaleString()} / ${k.dailySpendingCapCredits.toLocaleString()}`}
                  </td>
                  <td>{formatDate(k.lastUsedAt)}</td>
                  <td>{formatDate(k.createdAt)}</td>
                  <td className={styles.actionsCell}>
                    <button
                      className={styles.iconBtn}
                      title="Revoke key"
                      onClick={() => setRevokingId(k.id)}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(raw) => {
            setShowCreate(false)
            setNewKey(raw)
            load()
          }}
        />
      )}

      {newKey && <RevealKeyModal rawKey={newKey} onClose={() => setNewKey(null)} />}

      {revokingId && (
        <RevokeModal
          onCancel={() => setRevokingId(null)}
          onConfirm={async () => {
            const id = revokingId
            setRevokingId(null)
            try {
              const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" })
              if (!res.ok) throw new Error()
              showToast("Key revoked", "success")
              load()
            } catch {
              showToast("Couldn't revoke key", "error")
            }
          }}
        />
      )}
    </div>
  )
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (raw: string) => void
}) {
  const { showToast } = useToast()
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<Scope[]>(["chat"])
  const [capEnabled, setCapEnabled] = useState(false)
  const [cap, setCap] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const toggleScope = (s: Scope) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const submit = async () => {
    setError("")
    if (!name.trim()) return setError("Give the key a name.")
    if (scopes.length === 0) return setError("Select at least one scope.")
    let dailySpendingCapCredits: number | null = null
    if (capEnabled) {
      const n = Number(cap)
      if (!Number.isInteger(n) || n <= 0) return setError("Daily cap must be a positive whole number.")
      dailySpendingCapCredits = n
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes, dailySpendingCapCredits }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.errors ? Object.values(data.errors)[0] as string : "Couldn't create key")
        return
      }
      onCreated(data.key)
    } catch {
      showToast("Couldn't create key", "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Create API key</h2>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <XMarkIcon width={18} height={18} />
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production website"
            maxLength={60}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Scopes</span>
          {(Object.keys(SCOPE_INFO) as Scope[]).map((s) => (
            <label key={s} className={styles.checkRow}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
              <span>
                <strong>{SCOPE_INFO[s].label}</strong>
                <span className={styles.checkHint}>{SCOPE_INFO[s].hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className={styles.field}>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={capEnabled} onChange={(e) => setCapEnabled(e.target.checked)} />
            <span>
              <strong>Daily spending cap</strong>
              <span className={styles.checkHint}>Optional. Pause the key once it spends this many credits in 24h.</span>
            </span>
          </label>
          {capEnabled && (
            <Input
              type="number"
              min={1}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              placeholder="e.g. 5000"
            />
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Create key
          </Button>
        </div>
      </div>
    </div>
  )
}

function RevealKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rawKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be unavailable; user can select manually */
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Your new API key</h2>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <XMarkIcon width={18} height={18} />
          </button>
        </div>

        <p className={styles.revealWarn}>
          Copy this key now — it&apos;s shown only once and can&apos;t be retrieved later.
        </p>

        <div className={styles.keyReveal}>
          <code>{rawKey}</code>
          <button className={styles.copyBtn} onClick={copy}>
            {copied ? <CheckIcon width={16} height={16} /> : <ClipboardDocumentIcon width={16} height={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className={styles.revealDocs}>
          Next:{" "}
          <Link href="/developers" target="_blank" rel="noopener noreferrer">
            read the developer docs
          </Link>{" "}
          to make your first request.
        </p>

        <div className={styles.modalActions}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}

function RevokeModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Revoke this key?</h2>
          <button className={styles.iconBtn} onClick={onCancel} aria-label="Close">
            <XMarkIcon width={18} height={18} />
          </button>
        </div>
        <p className={styles.subtitle}>
          Any app using this key will immediately stop working. This can&apos;t be undone.
        </p>
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Revoke key
          </Button>
        </div>
      </div>
    </div>
  )
}
