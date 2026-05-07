"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { AGENT_TEMPLATES, applyTemplateVariables, type TemplateVariables } from "@/lib/agentTemplates"
import { Input, Textarea } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import { ProductsEditor } from "@/components/dashboard/ProductsEditor"
import { CameraIcon, ArrowPathIcon, TagIcon } from "@heroicons/react/24/outline"
import { useDashboardData } from "@/hooks/useDashboardData"
import type { Product } from "@/types"
import styles from "./CreateAgentFlow.module.css"

const CATEGORIES = [
  "E-commerce & Retail", "Food & Restaurant", "Healthcare & Wellness",
  "Education & Training", "Finance & Insurance", "Real Estate",
  "Logistics & Delivery", "Fashion & Beauty", "Technology & Software",
  "Travel & Hospitality", "Legal Services", "Automotive",
  "Events & Entertainment", "Construction & Home Services", "Other",
]

type Tab = "profile" | "configuration"

export function CreateAgentFlow() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: dashboardData } = useDashboardData()
  const profileVars: TemplateVariables = {
    BUSINESS_NAME: dashboardData?.user?.businessName ?? undefined,
    BUSINESS_CATEGORY: dashboardData?.user?.businessCategory ?? undefined,
    BUSINESS_DESCRIPTION: dashboardData?.user?.businessDescription ?? undefined,
    CONTACT_EMAIL: dashboardData?.user?.businessEmail ?? dashboardData?.user?.email ?? undefined,
    CONTACT_PHONE: dashboardData?.user?.phone ?? undefined,
    WEBSITE: dashboardData?.user?.businessWebsite ?? undefined,
    ADDRESS: dashboardData?.user?.businessAddress ?? undefined,
  }

  const agentRuntime = "orchestrator"

  // Step 1: null = picker shown. After picking, holds the system prompt.
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("profile")

  // Profile state
  const [profile, setProfile] = useState({
    businessName: "",
    category: "",
    businessDescription: "",
    profileImageUrl: "",
  })
  const [previewUrl, setPreviewUrl] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  // Configuration state
  const [systemPrompt, setSystemPrompt] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [enhancing, setEnhancing] = useState(false)
  const [enhanced, setEnhanced] = useState(false)

  // Orchestrator-specific config
  const [orchestratorModel, setOrchestratorModel] = useState("gpt-4o-mini")
  const [orchestratorTemperature, setOrchestratorTemperature] = useState(0.7)
  const [orchestratorMaxTokens, setOrchestratorMaxTokens] = useState(800)

  // Submit state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // ── Step 1: template picker ──────────────────────────────────────────────
  if (selectedPrompt === null) {
    return (
      <div className={styles.pickerRoot}>
        <p className={styles.pickerHint}>Choose a starting point for your AI agent</p>
        <div className={styles.pickerGrid}>
          {AGENT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              className={styles.pickerCard}
              onClick={() => {
                // Pre-fill placeholders from the user's profile so they don't
                // have to type their own business name etc. Anything we don't
                // know stays as `[fill this in]` for them to edit.
                const filled = applyTemplateVariables(tpl.systemPrompt, profileVars)
                setSelectedPrompt(filled)
                setSystemPrompt(filled)
              }}
            >
              <span className={styles.pickerEmoji}>{tpl.emoji}</span>
              <span className={styles.pickerTitle}>{tpl.title}</span>
              <span className={styles.pickerDesc}>{tpl.description}</span>
            </button>
          ))}
          <button
            className={cn(styles.pickerCard, styles.pickerCardScratch)}
            onClick={() => {
              setSelectedPrompt("")
              setSystemPrompt("")
            }}
          >
            <span className={styles.pickerEmoji}>✏️</span>
            <span className={styles.pickerTitle}>From Scratch</span>
            <span className={styles.pickerDesc}>Start with a blank prompt and build your own custom AI agent.</span>
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: tabbed form ──────────────────────────────────────────────────

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setProfile((p) => ({ ...p, [name]: value }))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setIsUploading(true)
    setUploadError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setPreviewUrl(data.url)
      setProfile((p) => ({ ...p, profileImageUrl: data.url }))
    } catch {
      setUploadError("Failed to upload image. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleEnhance = async () => {
    setEnhancing(true)
    setError("")
    try {
      const res = await fetch("/api/agents/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: profile.businessName, systemPrompt }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSystemPrompt(data.instructions)
      setEnhanced(true)
    } catch {
      setError("Failed to generate with AI. Please try again.")
    } finally {
      setEnhancing(false)
    }
  }

  const handleSubmit = async () => {
    setError("")
    if (!profile.businessName.trim()) {
      setActiveTab("profile")
      setError("Business name is required.")
      return
    }
    if (!systemPrompt.trim()) {
      setActiveTab("configuration")
      setError("System prompt is required.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          responseGuidelines: systemPrompt,
          productsData: products,
          agentRuntime,
          ...(agentRuntime === "orchestrator" && {
            orchestratorModel,
            orchestratorTemperature,
            orchestratorMaxTokens,
          }),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed to create agent"); return }
      queryClient.invalidateQueries({ queryKey: ["me"] })
      router.push(`/dashboard/agent/${data.id}`)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const initials = profile.businessName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className={styles.root}>
      {/* Tabs */}
      <div className={styles.tabs}>
        {(["profile", "configuration"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={cn(styles.tab, activeTab === tab ? styles.tabActive : undefined)}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "profile" ? "Profile" : "Configuration"}
          </button>
        ))}
        <button className={styles.changeTemplate} onClick={() => setSelectedPrompt(null)}>
          ← Change template
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* ── Profile tab ── */}
      {activeTab === "profile" && (
        <div className={styles.tabContent}>
          <div className={styles.avatarSection}>
            <div className={styles.avatarWrap} onClick={() => !isUploading && fileInputRef.current?.click()}>
              {previewUrl
                ? <Image src={previewUrl} alt="Profile" width={96} height={96} className={styles.avatarImg} />
                : <div className={styles.avatarFallback}>{initials || "AI"}</div>
              }
              <div className={styles.avatarOverlay}>
                {isUploading
                  ? <ArrowPathIcon width={20} height={20} className={styles.uploadSpinner} />
                  : <CameraIcon width={20} height={20} />
                }
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleFileChange} disabled={isUploading} />
            <div className={styles.avatarInfo}>
              <div className={styles.avatarLabel}>Profile Photo <span className={styles.optional}>(optional)</span></div>
              <div className={styles.avatarHint}>{isUploading ? "Uploading…" : "Click to upload · JPG, PNG, WebP · Max 4MB"}</div>
              {uploadError && <div className={styles.uploadError}>{uploadError}</div>}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Identity</div>
            <div className={styles.fields}>
              <div className={styles.row}>
                <Input label="Business Name" name="businessName" placeholder="e.g. Acme Support" value={profile.businessName} onChange={handleProfileChange} required />
                <div className={styles.selectWrap}>
                  <label className={styles.selectLabel}><TagIcon width={13} height={13} /> Category</label>
                  <select name="category" className={styles.select} value={profile.category} onChange={handleProfileChange}>
                    <option value="">Select a category…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <Textarea label="Description" name="businessDescription" placeholder="What does your business do?" value={profile.businessDescription} onChange={handleProfileChange} style={{ minHeight: 90 }} />
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="button" size="lg" onClick={() => setActiveTab("configuration")}>Next: Configuration →</Button>
          </div>
        </div>
      )}

      {/* ── Configuration tab ── */}
      {activeTab === "configuration" && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>System Prompt</div>
                <div className={styles.sectionDesc}>The core instructions for your AI — customise the template or write your own.</div>
              </div>
              <div className={styles.promptActions}>
                {enhanced && <span className={styles.enhancedBadge}>✓ AI Generated</span>}
                <Button type="button" variant="secondary" size="sm" onClick={handleEnhance} loading={enhancing}>✨ Generate with AI</Button>
              </div>
            </div>
            <Textarea
              name="systemPrompt"
              placeholder={`You are a helpful WhatsApp assistant for [Business Name].\n\nAbout us: ...\nServices: ...\nTone: friendly and professional.`}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              style={{ minHeight: 300, fontFamily: "monospace", fontSize: 13 }}
            />
          </div>


          <div className={styles.section}>
            <div className={styles.sectionTitle}>Product Catalogue <span className={styles.optional}>(optional)</span></div>
            <div className={styles.sectionDesc} style={{ marginBottom: "1rem" }}>Add products the AI can reference when customers ask about pricing or availability.</div>
            <ProductsEditor value={products} onChange={setProducts} />
          </div>

          <div className={styles.actions}>
            <Button type="button" size="lg" onClick={handleSubmit} loading={loading}>Create Agent →</Button>
            <Button type="button" variant="ghost" onClick={() => setActiveTab("profile")}>← Back</Button>
          </div>
        </div>
      )}
    </div>
  )
}
