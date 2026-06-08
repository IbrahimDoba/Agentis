"use client"

import { useRouter } from "next/navigation"
import { Confetti } from "@/components/onboarding/Confetti"
import styles from "@/components/onboarding/OnboardingFlow.module.css"

// Shown after WhatsApp links successfully during onboarding — confetti + a
// "you're connected" success card. Replaces the old chat-scan auto-configure
// step the channels page used to bounce to.
export default function OnboardingConnectedPage() {
  const router = useRouter()

  return (
    <div className={styles.root}>
      <Confetti />

      <div className={styles.brand}>
        <span className={styles.brandDot} />
        D-Zero AI
      </div>

      <div className={styles.card} style={{ textAlign: "center" }}>
        <span className={styles.welcomeEmoji}>🎉</span>
        <h1 className={styles.stepTitle}>Your AI agent is connected!</h1>
        <p className={styles.stepSub}>
          Your WhatsApp number is linked and your agent is live — it&apos;ll start replying to
          customers right away. You can fine-tune its personality, knowledge and settings anytime
          from the dashboard.
        </p>
        <div className={styles.actions}>
          <div className={styles.actionsRight} style={{ marginInline: "auto" }}>
            <button className={styles.btnPrimary} onClick={() => router.push("/dashboard")}>
              Go to dashboard →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
