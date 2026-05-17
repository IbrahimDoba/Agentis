"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./OnboardingFlow.module.css"

const CATEGORIES = [
  "Retail & E-commerce",
  "Food & Beverage",
  "Healthcare & Wellness",
  "Real Estate",
  "Education & Training",
  "Professional Services",
  "Beauty & Personal Care",
  "Automotive",
  "Travel & Hospitality",
  "Finance & Insurance",
  "Technology",
  "Other",
]

const TOTAL_STEPS = 3

interface Props {
  userName: string
  businessName: string
}

export function OnboardingFlow({ userName, businessName }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 2: Business profile
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")

  async function finish() {
    setSaving(true)
    try {
      // 1. Mark onboarding complete + persist business profile fields the
      //    user filled in so they end up on the auto-config draft.
      const completeRes = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessCategory: category, businessDescription: description }),
      })
      if (!completeRes.ok) {
        await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      }

      // 2. Auto-create the agent so the QR-link step has something to
      //    attach to. We default to the orchestrator (DZero AI) runtime
      //    so the auto-configure flow + Baileys path are wired correctly.
      const agentRes = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessDescription: description || "",
          category: category || undefined,
          agentRuntime: "orchestrator",
          transportType: "baileys",
        }),
      })
      if (!agentRes.ok) {
        // If agent creation fails, fall back to the legacy manual flow
        // so the user isn't stranded with onboarding marked complete.
        router.push("/dashboard/agent/create")
        return
      }
      const created = await agentRes.json()
      const agentId = created.id ?? created.agent?.id
      if (!agentId) {
        router.push("/dashboard/agent/create")
        return
      }

      // 3. Off to the QR step. The channels page detects ?onboarding=1
      //    and on successful link bounces to /onboarding/auto-configure.
      router.push(`/dashboard/channels/whatsapp-web?onboarding=1&agentId=${agentId}`)
    } catch {
      router.push("/dashboard/agent/create")
    }
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className={styles.root}>
      {/* Brand bar */}
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        D-Zero AI
      </div>

      {/* Progress */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.card}>
        {/* Step 1: Welcome */}
        {step === 1 && (
          <>
            <span className={styles.welcomeEmoji}>👋</span>
            <p className={styles.stepLabel}>Step 1 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>Welcome, {userName.split(" ")[0]}!</h1>
            <p className={styles.stepSub}>
              Let&apos;s get {businessName ? `${businessName}` : "your business"} set up with an AI agent that handles customer conversations 24/7 on WhatsApp.
              <br /><br />
              This will only take a couple of minutes.
            </p>
            <div className={styles.actions}>
              <div className={styles.actionsRight}>
                <button className={styles.btnPrimary} onClick={() => setStep(2)}>
                  Let&apos;s go →
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 2: Business profile */}
        {step === 2 && (
          <>
            <p className={styles.stepLabel}>Step 2 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>About your business</h1>
            <p className={styles.stepSub}>
              Help us tailor your agent to your industry.
            </p>

            <div className={styles.field}>
              <label className={styles.label}>Business category</label>
              <select
                className={styles.select}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>What does your business do?</label>
              <textarea
                className={styles.textarea}
                placeholder="e.g. We sell handmade jewellery and offer custom engraving services…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(1)}>← Back</button>
              <div className={styles.actionsRight}>
                <button className={styles.btnSecondary} onClick={() => setStep(3)}>Skip</button>
                <button className={styles.btnPrimary} onClick={() => setStep(3)}>Next →</button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Connect WhatsApp + auto-configure (final step) */}
        {step === 3 && (
          <>
            <span className={styles.doneIcon}>📱</span>
            <p className={styles.stepLabel}>Step 3 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>Connect your WhatsApp</h1>
            <p className={styles.stepSub}>
              Next we&apos;ll show you a QR code to scan with WhatsApp. Once linked, we&apos;ll briefly study your recent customer chats to build your AI agent automatically — about 60 seconds total.
              <br /><br />
              Your conversations stay private and aren&apos;t shared or sold.
            </p>
            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(2)} disabled={saving}>← Back</button>
              <div className={styles.actionsRight}>
                <button
                  className={styles.btnPrimary}
                  onClick={finish}
                  disabled={saving}
                >
                  {saving ? "Setting up…" : "Connect WhatsApp →"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
