"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Button from "@/components/ui/Button"
import { useToast } from "@/context/ToastContext"
import styles from "./EmbedTab.module.css"

interface EmbedConfig {
  id: string
  publicKey: string
  allowedOrigins: string[]
  themeJson: {
    greeting?: string
    primaryColor?: string
    position?: "bottom-right" | "bottom-left"
  } | null
  isActive: boolean
}

interface EmbedTabProps {
  agentId: string
  onDirtyChange?: (dirty: boolean) => void
}

const DEFAULT_GREETING = "Hi! 👋 How can I help today?"
const DEFAULT_COLOR = "#00DC82"

export function EmbedTab({ agentId, onDirtyChange }: EmbedTabProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const { data, isLoading } = useQuery<{ embed: EmbedConfig }>({
    queryKey: ["embed", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/embed`)
      if (!res.ok) throw new Error("Failed to load embed config")
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const initial = data?.embed
  const [isActive, setIsActive] = useState(true)
  const [originsText, setOriginsText] = useState("")
  const [greeting, setGreeting] = useState(DEFAULT_GREETING)
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)

  // Sync local form state from the server payload on first load and after
  // successful save (server is the source of truth).
  useEffect(() => {
    if (!initial) return
    setIsActive(initial.isActive)
    setOriginsText(initial.allowedOrigins.join("\n"))
    setGreeting(initial.themeJson?.greeting ?? DEFAULT_GREETING)
    setPrimaryColor(initial.themeJson?.primaryColor ?? DEFAULT_COLOR)
  }, [initial])

  const allowedOrigins = useMemo(
    () => originsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    [originsText]
  )

  const isDirty = useMemo(() => {
    if (!initial) return false
    if (isActive !== initial.isActive) return true
    if (greeting !== (initial.themeJson?.greeting ?? DEFAULT_GREETING)) return true
    if (primaryColor !== (initial.themeJson?.primaryColor ?? DEFAULT_COLOR)) return true
    const a = [...allowedOrigins].sort().join("|")
    const b = [...initial.allowedOrigins].sort().join("|")
    return a !== b
  }, [initial, isActive, greeting, primaryColor, allowedOrigins])

  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty, onDirtyChange])

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/embed`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedOrigins,
          themeJson: {
            ...(initial?.themeJson ?? {}),
            greeting,
            primaryColor,
          },
          isActive,
        }),
      })
      if (!res.ok) throw new Error("Failed to save embed config")
      return res.json() as Promise<{ embed: EmbedConfig }>
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(["embed", agentId], payload)
      showToast("Embed settings saved.")
    },
    onError: () => showToast("Could not save embed settings.", "error"),
  })

  const copyKey = useCallback(async () => {
    if (!initial?.publicKey) return
    await navigator.clipboard.writeText(initial.publicKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 1500)
  }, [initial?.publicKey])

  const snippet = useMemo(() => {
    const pk = initial?.publicKey ?? "pk_live_loading..."
    const host = typeof window !== "undefined" ? window.location.origin : "https://app.dailzero.ai"
    return `<script>
  window.dz = window.dz || function(...a){(window.dz.q=window.dz.q||[]).push(a)}
  dz('init', { publicKey: '${pk}' })
</script>
<script async src="${host}/embed/v1.js"></script>`
  }, [initial?.publicKey])

  const copySnippet = useCallback(async () => {
    await navigator.clipboard.writeText(snippet)
    setSnippetCopied(true)
    setTimeout(() => setSnippetCopied(false), 1500)
  }, [snippet])

  if (isLoading) {
    return <div className={styles.loading}>Loading embed settings…</div>
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => { e.preventDefault(); save.mutate() }}
    >
      {/* Status + public key */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Embed widget</h2>
        <p className={styles.sectionDesc}>
          Drop a small <code>&lt;script&gt;</code> snippet on any website and visitors can chat with this agent directly from the page. The widget will be live once Batch 3 ships — for now you can configure the settings here.
        </p>

        <div className={styles.row}>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            className={`${styles.switch} ${isActive ? styles.switchOn : ""}`}
            onClick={() => setIsActive((v) => !v)}
          >
            <span className={styles.switchKnob} />
          </button>
          <div className={styles.rowText}>
            <label className={styles.rowTitle}>Enable embed widget</label>
            <p className={styles.rowDesc}>
              When off, the widget refuses to bootstrap on any site and the public API rejects all incoming messages for this agent. Existing conversations are not deleted.
            </p>
          </div>
        </div>

        <div className={styles.keyRow}>
          <label className={styles.fieldLabel}>Public key</label>
          <div className={styles.keyWrap}>
            <code className={styles.keyValue}>{initial?.publicKey ?? "—"}</code>
            <button type="button" className={styles.copyBtn} onClick={copyKey}>
              {keyCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className={styles.fieldHint}>Identifies this agent in the embed snippet. Safe to expose publicly — abuse is gated by the allowed origins below.</p>
        </div>
      </section>

      {/* Allowed origins */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Allowed origins</h2>
        <p className={styles.sectionDesc}>
          One per line. Only requests from these origins can use the widget — anything else gets a 403. Use the full origin including protocol, e.g. <code>https://example.com</code>.
        </p>
        <textarea
          className={styles.textarea}
          value={originsText}
          onChange={(e) => setOriginsText(e.target.value)}
          placeholder={"https://example.com\nhttps://www.example.com"}
          rows={4}
        />
        <p className={styles.fieldHint}>
          Leave empty to block all traffic (useful while testing). No <code>*</code> wildcards in v1.
        </p>
      </section>

      {/* Theme */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Theme</h2>
        <p className={styles.sectionDesc}>How the widget appears on the visitor&apos;s site. More options ship in Batch 4.</p>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="embed-greeting">Greeting</label>
          <input
            id="embed-greeting"
            type="text"
            className={styles.input}
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            maxLength={200}
          />
          <p className={styles.fieldHint}>Shown when the visitor opens the panel for the first time.</p>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel} htmlFor="embed-color">Primary color</label>
          <div className={styles.colorWrap}>
            <input
              id="embed-color"
              type="color"
              className={styles.colorInput}
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
            <code className={styles.colorHex}>{primaryColor.toUpperCase()}</code>
          </div>
        </div>
      </section>

      {/* Snippet */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Install snippet</h2>
        <p className={styles.sectionDesc}>Paste this just before the closing <code>&lt;/body&gt;</code> tag on each page that should show the widget.</p>
        <pre className={styles.snippet}>{snippet}</pre>
        <div className={styles.snippetActions}>
          <Button type="button" variant="secondary" onClick={copySnippet}>
            {snippetCopied ? "Copied!" : "Copy snippet"}
          </Button>
        </div>
      </section>

      <div className={styles.actions}>
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>
          Save Embed Settings
        </Button>
      </div>
    </form>
  )
}

export default EmbedTab
