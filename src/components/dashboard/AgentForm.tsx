"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import styles from "./AgentForm.module.css"
import { Textarea } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import { ProductsEditor } from "@/components/dashboard/ProductsEditor"
import { ArrowPathIcon } from "@heroicons/react/24/outline"
import type { AgentPublic, Product } from "@/types"

interface AgentFormProps {
  initialData?: Partial<AgentPublic>
  agentId?: string
}

export function AgentForm({ initialData, agentId }: AgentFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [systemPrompt, setSystemPrompt] = useState(initialData?.responseGuidelines ?? "")
  const [promptLoading, setPromptLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>(
    (initialData?.productsData as Product[] | undefined) ?? []
  )
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
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
    setSuccess("")

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
        body: JSON.stringify({ responseGuidelines: systemPrompt, productsData: products }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to save agent")
        return
      }

      setSuccess(agentId ? "Agent updated successfully!" : "Agent created! Our team will review and set it up.")
      if (Array.isArray(data.productsData)) {
        setProducts(data.productsData as Product[])
      }
      queryClient.invalidateQueries({ queryKey: ["me"] })
      if (!agentId) {
        router.push(`/dashboard/agent/${data.id}`)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

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
