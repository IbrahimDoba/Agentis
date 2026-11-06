import Link from "next/link"
import styles from "./HowItWorks.module.css"

const steps = [
  {
    number: "1",
    title: "Sign up and apply",
    description: "Create your account and send basic business information. Approval takes less than 24 hours.",
  },
  {
    number: "2",
    title: "Configure your agent",
    description: "Add your business details, FAQs and response style. The AI can suggest answers from your website.",
  },
  {
    number: "3",
    title: "We set it up",
    description: "Our team connects your WhatsApp Business number to the agent, and you’re told once it’s live.",
  },
  {
    number: "4",
    title: "Go live and monitor",
    description: "Your agent starts handling conversations right away. Follow them in the dashboard as you grow.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 className={styles.title}>Live in four steps</h2>
          <p className={styles.subtitle}>For busy owners who just want it to work</p>
        </div>

        <div className={styles.steps}>
          {steps.map((step) => (
            <div key={step.number} className={styles.step}>
              <div className={styles.stepNumber}>{step.number}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.description}</p>
            </div>
          ))}
        </div>

        <div className={styles.cta}>
          <Link href="/signup" className={styles.ctaPrimary}>Start free</Link>
          <Link href="/how-it-works" className={styles.ctaLink}>See the detailed breakdown</Link>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
