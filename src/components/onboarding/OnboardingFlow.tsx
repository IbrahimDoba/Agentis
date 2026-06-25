"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "@heroicons/react/24/outline"
import { KnowledgeBaseTab } from "@/components/dashboard/KnowledgeBaseTab"
import { useBrand } from "@/components/BrandProvider"
import styles from "./OnboardingFlow.module.css"

const TOTAL_STEPS = 3

type Personality = {
  id: string
  emoji: string
  label: string
  desc: string
  prompt: string
}

// Each personality seeds a base system prompt. The user can edit it or let AI
// polish it before the agent is created.
const PERSONALITIES: Personality[] = [
  { id: "friendly", emoji: "😊", label: "Friendly & casual", desc: "Warm and approachable, everyday language.", prompt: "You are warm, friendly and approachable. Use casual, everyday language, a relaxed tone, and the occasional emoji. Make customers feel genuinely welcome." },
  { id: "professional", emoji: "💼", label: "Professional", desc: "Polished, formal and precise.", prompt: "You are polished and professional. Use clear, formal business language, stay precise and courteous, and avoid slang or emojis." },
  { id: "concise", emoji: "⚡", label: "Concise & efficient", desc: "Short, direct, straight to the point.", prompt: "You are concise and efficient. Give short, direct answers, lead with the key information, and skip unnecessary filler." },
  { id: "supportive", emoji: "🤝", label: "Warm & supportive", desc: "Patient, empathetic and reassuring.", prompt: "You are patient, empathetic and supportive. Acknowledge how the customer feels, reassure them, and guide them step by step." },
  { id: "sales", emoji: "🚀", label: "Persuasive (sales)", desc: "Enthusiastic, value-driven, drives action.", prompt: "You are an enthusiastic, persuasive sales assistant. Highlight benefits and value, create gentle urgency, recommend relevant products, and guide customers toward a purchase." },
]

interface Props {
  userName: string
  businessName: string
}

function buildPrompt(p: Personality, businessName: string, description: string): string {
  const lines = [`You are the AI customer-service assistant for ${businessName || "our business"}.`]
  if (description.trim()) lines.push(`\nAbout the business: ${description.trim()}`)
  lines.push(`\n## Personality\n${p.prompt}`)
  lines.push(`\nAnswer customer questions about the business, its products and services. If you don't know something, say so honestly and offer to connect them with a human.`)
  return lines.join("\n")
}

export function OnboardingFlow({ businessName }: Props) {
  const brand = useBrand()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState("")

  // Step 1 — personality
  const [personalityId, setPersonalityId] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [generating, setGenerating] = useState(false)

  // Step 2 — knowledge
  const [faqs, setFaqs] = useState("")

  // Shared
  const [agentId, setAgentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectPersonality = (p: Personality) => {
    setPersonalityId(p.id)
    setSystemPrompt(buildPrompt(p, businessName, description))
  }

  const generateWithAi = async () => {
    if (!systemPrompt.trim()) return
    setGenerating(true)
    setError("")
    try {
      const res = await fetch("/api/agents/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, systemPrompt }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.instructions) setSystemPrompt(data.instructions)
    } catch {
      setError("Couldn't generate with AI — you can edit the instructions manually.")
    } finally {
      setGenerating(false)
    }
  }

  // Step 1 → 2: create the orchestrator agent so the knowledge upload + QR step
  // have something to attach to. Re-entering step 1 won't create a duplicate.
  const createAgentAndContinue = async () => {
    if (!systemPrompt.trim()) {
      setError("Pick a personality first.")
      return
    }
    if (agentId) {
      setStep(2)
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessDescription: description,
          responseGuidelines: systemPrompt,
          agentRuntime: "orchestrator",
          transportType: "baileys",
        }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      const id = created.id ?? created.agent?.id
      if (!id) throw new Error()
      setAgentId(id)
      setStep(2)
    } catch {
      setError("Couldn't create your agent. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Step 2 → 3: persist FAQs onto the agent (non-blocking).
  const saveKnowledgeAndContinue = async () => {
    if (!agentId) {
      setStep(3)
      return
    }
    setSaving(true)
    try {
      if (faqs.trim()) {
        await fetch(`/api/agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faqs }),
        })
      }
    } catch {
      // non-blocking — they can add FAQs later from the dashboard
    } finally {
      setSaving(false)
      setStep(3)
    }
  }

  // Step 3: mark onboarding complete, then hand off to the QR connect page.
  // On a successful link the channels page bounces to /onboarding/connected.
  const connectWhatsApp = async () => {
    if (!agentId) return
    setSaving(true)
    await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessDescription: description }),
    }).catch(() => {})
    router.push(`/dashboard/channels/whatsapp-web?onboarding=1&agentId=${agentId}`)
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        {brand.appName}
      </div>

      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.card}>
        {error && <div className={styles.error}>{error}</div>}

        {/* Step 1 — Personality */}
        {step === 1 && (
          <>
            <p className={styles.stepLabel}>Step 1 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>How should your agent sound?</h1>
            <p className={styles.stepSub}>
              Pick a personality for {businessName || "your business"} — fine-tune the instructions below, or let AI polish them.
            </p>

            <div className={styles.personaGrid}>
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.personaCard} ${personalityId === p.id ? styles.personaCardActive : ""}`}
                  onClick={() => selectPersonality(p)}
                >
                  <span className={styles.personaEmoji}>{p.emoji}</span>
                  <span className={styles.personaLabel}>{p.label}</span>
                  <span className={styles.personaDesc}>{p.desc}</span>
                </button>
              ))}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Tell us about your business <span className={styles.optional}>(optional)</span>
              </label>
              <textarea
                className={styles.textarea}
                placeholder="e.g. We sell handmade jewellery and offer custom engraving…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {personalityId && (
              <div className={styles.field}>
                <div className={styles.promptHeader}>
                  <label className={styles.label}>Agent instructions</label>
                  <button type="button" className={styles.generateBtn} onClick={generateWithAi} disabled={generating}>
                    <SparklesIcon width={14} height={14} /> {generating ? "Generating…" : "Generate with AI"}
                  </button>
                </div>
                <textarea
                  className={styles.promptArea}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
              </div>
            )}

            <div className={styles.actions}>
              <div className={styles.actionsRight}>
                <button className={styles.btnPrimary} onClick={createAgentAndContinue} disabled={saving || !personalityId}>
                  {saving ? "Creating…" : "Next →"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 2 — Knowledge */}
        {step === 2 && (
          <>
            <p className={styles.stepLabel}>Step 2 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>Give your agent some knowledge</h1>
            <p className={styles.stepSub}>
              Add frequently asked questions, or upload a document about your business — your agent uses these to answer customers.
            </p>

            <div className={styles.field}>
              <label className={styles.label}>
                Frequently asked questions <span className={styles.optional}>(optional)</span>
              </label>
              <textarea
                className={styles.textarea}
                placeholder={"Q: What are your opening hours?\nA: We're open Mon–Sat, 9am–6pm.\n\nQ: Do you deliver?\nA: Yes, nationwide within 3–5 days."}
                value={faqs}
                onChange={(e) => setFaqs(e.target.value)}
                style={{ minHeight: 140 }}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Upload a document <span className={styles.optional}>(optional)</span>
              </label>
              {agentId && <KnowledgeBaseTab agentId={agentId} />}
            </div>

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(1)} disabled={saving}>← Back</button>
              <div className={styles.actionsRight}>
                <button className={styles.btnSecondary} onClick={() => setStep(3)} disabled={saving}>Skip</button>
                <button className={styles.btnPrimary} onClick={saveKnowledgeAndContinue} disabled={saving}>
                  {saving ? "Saving…" : "Next →"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3 — Connect */}
        {step === 3 && (
          <>
            <span className={styles.doneIcon}>📱</span>
            <p className={styles.stepLabel}>Step 3 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>Connect WhatsApp</h1>
            <p className={styles.stepSub}>
              Last step — scan a QR code to link your WhatsApp number. Your agent goes live the moment it&apos;s connected.
            </p>
            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(2)} disabled={saving}>← Back</button>
              <div className={styles.actionsRight}>
                <button className={styles.btnPrimary} onClick={connectWhatsApp} disabled={saving || !agentId}>
                  {saving ? "Opening…" : "Connect WhatsApp →"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
