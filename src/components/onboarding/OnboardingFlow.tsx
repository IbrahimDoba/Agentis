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

const GOALS = [
  { id: "leads", emoji: "🎯", label: "Generate Leads" },
  { id: "support", emoji: "💬", label: "Customer Support" },
  { id: "sales", emoji: "💰", label: "Drive Sales" },
  { id: "bookings", emoji: "📅", label: "Take Bookings" },
  { id: "faq", emoji: "❓", label: "Answer FAQs" },
  { id: "general", emoji: "🤝", label: "General Queries" },
]

const TOUR_FEATURES = [
  {
    icon: "💬",
    name: "Chats",
    desc: "View and replay every conversation your AI agent has had with customers in real time.",
  },
  {
    icon: "🎯",
    name: "Leads",
    desc: "Automatically captured contacts your agent identified as potential customers.",
  },
  {
    icon: "👥",
    name: "Contacts",
    desc: "A full directory of everyone who has spoken with your agent, with chat history.",
  },
  {
    icon: "🤖",
    name: "Agents",
    desc: "Create and manage your AI agents — configure knowledge, tools, and personality.",
  },
]

const TOTAL_STEPS = 5

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

  // Step 3: Goals
  const [goals, setGoals] = useState<string[]>([])

  function toggleGoal(id: string) {
    setGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  async function finish() {
    setSaving(true)
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessCategory: category, businessDescription: description, goals }),
      })
      router.push("/dashboard/agent/create")
    } catch {
      setSaving(false)
    }
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className={styles.root}>
      {/* Brand bar */}
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        Agentis
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

        {/* Step 3: Primary goal */}
        {step === 3 && (
          <>
            <p className={styles.stepLabel}>Step 3 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>What&apos;s your main goal?</h1>
            <p className={styles.stepSub}>Select all that apply — this helps us pre-configure your agent.</p>

            <div className={styles.goalGrid}>
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  className={`${styles.goalCard} ${goals.includes(g.id) ? styles.goalCardSelected : ""}`}
                  onClick={() => toggleGoal(g.id)}
                >
                  <span className={styles.goalEmoji}>{g.emoji}</span>
                  <span className={styles.goalLabel}>{g.label}</span>
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(2)}>← Back</button>
              <div className={styles.actionsRight}>
                <button className={styles.btnSecondary} onClick={() => setStep(4)}>Skip</button>
                <button className={styles.btnPrimary} onClick={() => setStep(4)}>Next →</button>
              </div>
            </div>
          </>
        )}

        {/* Step 4: Platform tour */}
        {step === 4 && (
          <>
            <p className={styles.stepLabel}>Step 4 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>Here&apos;s what you get</h1>
            <p className={styles.stepSub}>A quick look at the platform before you dive in.</p>

            <div className={styles.tourGrid}>
              {TOUR_FEATURES.map((f) => (
                <div key={f.name} className={styles.tourItem}>
                  <span className={styles.tourIcon}>{f.icon}</span>
                  <div className={styles.tourInfo}>
                    <p className={styles.tourName}>{f.name}</p>
                    <p className={styles.tourDesc}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(3)}>← Back</button>
              <div className={styles.actionsRight}>
                <button className={styles.btnPrimary} onClick={() => setStep(5)}>Next →</button>
              </div>
            </div>
          </>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <>
            <span className={styles.doneIcon}>🚀</span>
            <p className={styles.stepLabel}>Step 5 of {TOTAL_STEPS}</p>
            <h1 className={styles.stepTitle}>You&apos;re all set!</h1>
            <p className={styles.stepSub}>
              Your account is ready. Next, create your first AI agent — choose a template, set up its personality, and connect it to WhatsApp.
              <br /><br />
              Once submitted, our team reviews it and activates it within 24 hours.
            </p>
            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={() => setStep(4)}>← Back</button>
              <div className={styles.actionsRight}>
                <button
                  className={styles.btnPrimary}
                  onClick={finish}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Create my agent →"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
