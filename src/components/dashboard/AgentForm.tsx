"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import styles from "./AgentForm.module.css"
import { Textarea } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import { ProductsEditor } from "@/components/dashboard/ProductsEditor"
import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { useToast } from "@/context/ToastContext"
import type { AgentPublic, Product } from "@/types"

interface AgentFormProps {
  initialData?: Partial<AgentPublic>
  agentId?: string
  onDirtyChange?: (dirty: boolean) => void
}

export function AgentForm({ initialData, agentId, onDirtyChange }: AgentFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const initialPrompt = initialData?.responseGuidelines ?? ""
  const initialProducts = (initialData?.productsData as Product[] | undefined) ?? []

  const [systemPrompt, setSystemPrompt] = useState(initialPrompt)
  const [promptLoading, setPromptLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>(initialProducts)

  // Baselines for dirty-tracking. They start at the initial values, then reset
  // to (a) the prompt we asynchronously load from ElevenLabs on mount and
  // (b) the values we just saved — so neither loading nor saving falsely marks
  // the form dirty. (Previously isDirty compared against the original props
  // forever, so the "unsaved changes" warning fired even with no edits, and
  // again right after saving.)
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt)
  const [savedProducts, setSavedProducts] = useState<Product[]>(initialProducts)

  const initialAlbumEnabled = initialData?.productAlbumEnabled ?? false
  const initialAlbumTitle = initialData?.productAlbumTitle ?? ""
  const [productAlbumEnabled, setProductAlbumEnabled] = useState(initialAlbumEnabled)
  const [productAlbumTitle, setProductAlbumTitle] = useState(initialAlbumTitle)
  const [savedAlbumEnabled, setSavedAlbumEnabled] = useState(initialAlbumEnabled)
  const [savedAlbumTitle, setSavedAlbumTitle] = useState(initialAlbumTitle)

  const isDirty =
    systemPrompt !== savedPrompt ||
    JSON.stringify(products) !== JSON.stringify(savedProducts) ||
    productAlbumEnabled !== savedAlbumEnabled ||
    productAlbumTitle !== savedAlbumTitle

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  const { showToast } = useToast()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanced, setEnhanced] = useState(false)

  const fetchFromElevenLabs = async () => {
    if (!agentId) return
    setPromptLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/system-prompt`)
      if (!res.ok) return
      const data = await res.json()
      if (data.connected && data.systemPrompt) {
        setSystemPrompt(data.systemPrompt)
        // Loading the live prompt isn't a user edit — move the baseline with it
        // so the form doesn't read as dirty on open.
        setSavedPrompt(data.systemPrompt)
      }
    } catch {
      // silently fall back to local value
    } finally {
      setPromptLoading(false)
    }
  }

  useEffect(() => {
    fetchFromElevenLabs()
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnhance = async () => {
    setEnhancing(true)
    setError("")
    try {
      const res = await fetch("/api/agents/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: initialData?.businessName ?? "",
          systemPrompt,
        }),
      })

      if (!res.ok) throw new Error("Enhancement failed")

      const data = await res.json()
      setSystemPrompt(data.instructions)
      setEnhanced(true)
    } catch {
      setError("Failed to generate with AI. Please try again.")
    } finally {
      setEnhancing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!systemPrompt.trim()) {
      setError("System prompt is required.")
      return
    }

    setLoading(true)
    try {
      const url = agentId ? `/api/agents/${agentId}` : "/api/agents"
      const method = agentId ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseGuidelines: systemPrompt, productsData: products, productAlbumEnabled, productAlbumTitle }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to save agent")
        return
      }

      showToast(agentId ? "Agent updated successfully!" : "Agent created! Our team will review and set it up.")
      const nextProducts = Array.isArray(data.productsData) ? (data.productsData as Product[]) : products
      setProducts(nextProducts)
      // Reset the dirty baseline to what we just saved, so switching tabs right
      // after a save no longer warns about unsaved changes.
      setSavedPrompt(systemPrompt)
      setSavedProducts(nextProducts)
      setSavedAlbumEnabled(productAlbumEnabled)
      setSavedAlbumTitle(productAlbumTitle)
      queryClient.invalidateQueries({ queryKey: ["me"] })
      if (!agentId) {
        router.push(`/dashboard/agent/${data.id}`)
      }
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}

      {/* System Prompt */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>System Prompt</div>
          <div className={styles.sectionDesc}>
            The core instructions for your AI agent — include your business info, services, FAQs, operating hours, and tone.
          </div>
        </div>
        <div className={styles.fields}>
          <div>
            <div className={styles.guidelinesHeader}>
              <span className={styles.guidelinesLabel}>Prompt</span>
              <div className={styles.guidelinesActions}>
                {enhanced && <span className={styles.enhancedBadge}>✓ AI Generated</span>}
                {agentId && (
                  <button
                    type="button"
                    className={styles.refreshBtn}
                    onClick={fetchFromElevenLabs}
                    disabled={promptLoading}
                    title="Refresh from ElevenLabs"
                  >
                    <ArrowPathIcon
                      width={13}
                      height={13}
                      className={promptLoading ? styles.spinning : undefined}
                    />
                  </button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleEnhance}
                  loading={enhancing}
                >
                  ✨ Generate with AI
                </Button>
              </div>
            </div>
            {promptLoading ? (
              <div className={styles.promptSkeleton} />
            ) : (
              <Textarea
                name="systemPrompt"
                placeholder={`You are a helpful WhatsApp assistant for [Business Name].\n\nAbout us: ...\nServices: ...\nOperating hours: ...\nFAQs: ...\nTone: friendly and professional.`}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                style={{ minHeight: 320, fontFamily: "monospace", fontSize: 13 }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Product Catalogue <span className={styles.optional}>(optional)</span></div>
          <div className={styles.sectionDesc}>Add individual products the AI can reference when customers ask about pricing or availability.</div>
        </div>
        <ProductsEditor value={products} onChange={setProducts} />
      </div>

      {/* Product album */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Send catalogue as an album <span className={styles.optional}>(optional)</span></div>
          <div className={styles.sectionDesc}>
            When on, the AI sends all your product photos as one WhatsApp album the moment a customer asks to see what you have — e.g. &ldquo;let me see what you have&rdquo;.
          </div>
        </div>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "var(--text-primary)" }}>
          <input
            type="checkbox"
            checked={productAlbumEnabled}
            onChange={(e) => setProductAlbumEnabled(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }}
          />
          <span>Enable product album{products.length > 0 ? ` — ${products.length} photo${products.length === 1 ? "" : "s"}` : ""}</span>
        </label>

        {productAlbumEnabled && (
          <div style={{ marginTop: 14 }}>
            <label className={styles.fieldLabel} htmlFor="albumTitle">Intro message <span className={styles.optional}>(optional)</span></label>
            <input
              id="albumTitle"
              type="text"
              value={productAlbumTitle}
              onChange={(e) => setProductAlbumTitle(e.target.value)}
              placeholder="Here's our collection 👇"
              maxLength={300}
              style={{
                width: "100%", marginTop: 6, padding: "0.6rem 0.8rem",
                background: "var(--bg-secondary)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                fontFamily: "inherit", fontSize: 14, outline: "none",
              }}
            />
            <div className={styles.fieldHint}>Sent as a short text just above the album. Leave blank to send only the photos.</div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="submit" loading={loading} size="lg">
          {agentId ? "Save Changes" : "Create Agent →"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default AgentForm
