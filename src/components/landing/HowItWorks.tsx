import Link from "next/link"
import styles from "./HowItWorks.module.css"

const steps = [
  {
    number: "01",
    title: "Sign Up & Apply",
    description:
      "Create your D-Zero AI account and submit basic business information. Approval takes less than 24 hours.",
    accent: true,
  },
  {
    number: "02",
    title: "Configure Your Agent",
    description:
      "Fill in your business details, FAQs, and response style. Our AI can auto-generate suggestions from your website.",
    accent: false,
  },
  {
    number: "03",
    title: "We Set It Up",
    description:
      "Our team connects your WhatsApp Business number to the AI agent. You'll be notified once it's live.",
    accent: false,
  },
  {
    number: "04",
    title: "Go Live & Monitor",
    description:
      "Your agent starts handling conversations immediately. Watch the dashboard in real time and optimize as you grow.",
    accent: false,
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.label}>How It Works</div>
          <h2 className={styles.title}>Get started in minutes, not months</h2>
          <p className={styles.subtitle}>
            A simple four-step process designed for busy business owners who just want it to work.
          </p>
        </div>

        <div className={styles.steps}>
          {steps.map((step, i) => (
            <div key={step.number} className={styles.step}>
              <div className={`${styles.stepNumber} ${step.accent ? styles.stepNumberActive : ""}`}>
                {step.number}
                {i < steps.length - 1 && <div className={styles.connector} />}
              </div>
              <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.cta}>
          <Link href="/how-it-works" className={styles.ctaLink}>
            See detailed breakdown
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link href="/signup" className={styles.ctaPrimary}>
            Start for free
          </Link>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
