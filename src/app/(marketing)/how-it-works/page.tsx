"use client"
import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

function SignupIllustration() {
  return (
    <div className={styles.stepIllus}>
      <div className={styles.signupCard}>
        <div className={styles.signupHeader}>
          <div className={styles.signupLogo}>
            <span className={styles.signupLogoDot} />
            D-Zero AI
          </div>
          <div className={styles.signupTitle}>Create your account</div>
        </div>
        <div className={styles.signupForm}>
          <div className={styles.signupField}>
            <div className={styles.signupLabel}>Business Name</div>
            <div className={styles.signupInput}>Zara Fashion House</div>
          </div>
          <div className={styles.signupField}>
            <div className={styles.signupLabel}>Email Address</div>
            <div className={styles.signupInput}>hello@zarafashion.ng</div>
          </div>
          <div className={styles.signupField}>
            <div className={styles.signupLabel}>Business Type</div>
            <div className={styles.signupSelect}>
              Fashion Retail
              <span className={styles.signupChevron}>›</span>
            </div>
          </div>
          <div className={styles.signupBtn}>Create Account →</div>
        </div>
      </div>
    </div>
  )
}

function ConfigureIllustration() {
  return (
    <div className={styles.stepIllus}>
      <div className={styles.configCard}>
        <div className={styles.configHeader}>
          <span>Agent Setup</span>
          <span className={styles.configStep}>2 / 3</span>
        </div>
        <div className={styles.configBody}>
          <div className={styles.configSection}>
            <div className={styles.configSectionTitle}>Business Description</div>
            <div className={styles.configTextarea}>
              We are a premium fashion house in Lagos selling women's clothing, accessories, and shoes. We offer nationwide delivery...
            </div>
          </div>
          <div className={styles.configSection}>
            <div className={styles.configSectionTitle}>Response Style</div>
            <div className={styles.configOptions}>
              <div className={`${styles.configOption} ${styles.configOptionActive}`}>Friendly</div>
              <div className={styles.configOption}>Professional</div>
              <div className={styles.configOption}>Casual</div>
            </div>
          </div>
          <div className={styles.configAiBox}>
            <div className={styles.configAiIcon}>✨</div>
            <div>
              <div className={styles.configAiTitle}>AI-generated FAQs ready</div>
              <div className={styles.configAiSub}>12 questions found from your website</div>
            </div>
            <div className={styles.configAiArrow}>→</div>
          </div>
          <div className={styles.configProgress}>
            <div className={styles.configProgressFill} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SetupIllustration() {
  return (
    <div className={styles.stepIllus}>
      <div className={styles.setupCard}>
        <div className={styles.setupHeader}>
          <span>Connection Status</span>
        </div>
        <div className={styles.setupBody}>
          <div className={styles.setupSteps}>
            {[
              { label: "Agent created", done: true },
              { label: "Business verified", done: true },
              { label: "WhatsApp linked", done: true },
              { label: "Test message sent", done: true },
              { label: "Going live…", done: false, active: true },
            ].map((s) => (
              <div key={s.label} className={styles.setupStepRow}>
                <div className={`${styles.setupStepIcon} ${s.done ? styles.setupStepDone : s.active ? styles.setupStepActive : ""}`}>
                  {s.done ? "✓" : s.active ? "⟳" : "○"}
                </div>
                <div className={`${styles.setupStepLabel} ${s.done ? styles.setupStepLabelDone : ""}`}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.setupNote}>
            Our team will notify you by email once your agent is live. Usually takes under 4 hours.
          </div>
        </div>
      </div>
    </div>
  )
}

function LiveIllustration() {
  return (
    <div className={styles.stepIllus}>
      <div className={styles.liveCard}>
        <div className={styles.liveHeader}>
          <div>
            <div className={styles.liveName}>Zara Fashion Agent</div>
            <div className={styles.liveStatus}>
              <span className={styles.liveDot} />
              Live · Handling conversations
            </div>
          </div>
          <div className={styles.liveUptime}>99.9%</div>
        </div>
        <div className={styles.liveMetrics}>
          <div className={styles.liveMetric}>
            <div className={styles.liveMetricVal}>248</div>
            <div className={styles.liveMetricLbl}>Today</div>
          </div>
          <div className={styles.liveMetric}>
            <div className={styles.liveMetricVal}>1.4s</div>
            <div className={styles.liveMetricLbl}>Avg Reply</div>
          </div>
          <div className={styles.liveMetric}>
            <div className={styles.liveMetricVal}>96%</div>
            <div className={styles.liveMetricLbl}>Resolved</div>
          </div>
        </div>
        <div className={styles.liveChart}>
          {[30, 55, 40, 70, 50, 80, 65, 90, 75, 85, 70, 95].map((h, i) => (
            <div key={i} className={styles.liveBar} style={{ height: `${h}%`, opacity: 0.5 + i / 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}

const steps = [
  {
    number: "01",
    title: "Sign Up & Apply",
    description:
      "Create your D-Zero AI account in under 2 minutes. Tell us about your business — name, industry, and the WhatsApp number you want to automate. We review applications within 24 hours.",
    details: [
      "Simple signup form — no technical knowledge needed",
      "Tell us about your business type and goals",
      "Submit your WhatsApp Business number",
      "Receive confirmation email within hours",
    ],
    illustration: <SignupIllustration />,
  },
  {
    number: "02",
    title: "Configure Your Agent",
    description:
      "Use our guided wizard to set up your AI agent. Describe your business, set response style, define operating hours, and add your FAQs. Our AI can even auto-generate FAQ suggestions from your website.",
    details: [
      "Describe your business in plain English",
      "Choose your agent's personality and tone",
      "Set business hours and holiday schedules",
      "AI auto-generates FAQs from your website",
    ],
    illustration: <ConfigureIllustration />,
  },
  {
    number: "03",
    title: "We Set It Up",
    description:
      "Our team handles the technical side. We connect your WhatsApp Business account to the AI agent, run test conversations, and ensure everything is working perfectly before you go live.",
    details: [
      "Dedicated setup engineer assigned to your account",
      "WhatsApp Business API connection handled by us",
      "Full test suite run before launch",
      "You get notified by email when ready",
    ],
    illustration: <SetupIllustration />,
  },
  {
    number: "04",
    title: "Go Live & Monitor",
    description:
      "Your agent starts handling conversations instantly. Watch the dashboard in real time, review transcripts, and get weekly performance reports. Improve your agent anytime from your settings.",
    details: [
      "Real-time conversation dashboard",
      "Full transcript review",
      "Weekly automated performance reports",
      "Update FAQs and settings anytime",
    ],
    illustration: <LiveIllustration />,
  },
]

const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes! Every plan comes with a 7-day free trial. No credit card required. You can explore all features before committing.",
  },
  {
    q: "How long does setup take?",
    a: "Most businesses are live within 4–8 hours of completing their configuration. Our team handles the technical WhatsApp connection while you focus on your business.",
  },
  {
    q: "Do I need a WhatsApp Business account?",
    a: "Yes. You'll need a WhatsApp Business account with a dedicated phone number. If you don't have one, we can guide you through the process of getting approved — it usually takes 1–3 business days.",
  },
  {
    q: "Can I customise what the AI says?",
    a: "Absolutely. You define the agent's personality, tone, and exact responses to specific questions. You can also set rules for what topics the agent should or shouldn't discuss.",
  },
  {
    q: "What happens when the AI can't answer?",
    a: "When the AI encounters a question it can't confidently answer, it politely tells the customer it will connect them with a human team member, then sends you an alert. No customer falls through the cracks.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.",
  },
]

export default function HowItWorksPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>How It Works</div>
            <h1 className={styles.heroTitle}>
              Get Started in
              <br />
              <span>Minutes, Not Months</span>
            </h1>
            <p className={styles.heroSubtitle}>
              D-Zero AI is designed for busy business owners. No developers, no complex integrations,
              no long onboarding. Just four simple steps to a fully automated WhatsApp agent.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className={styles.stepsSection}>
          <div className={styles.stepsInner}>
            {steps.map((step, i) => (
              <div key={step.number} className={`${styles.stepRow} ${i % 2 === 1 ? styles.stepRowReverse : ""}`}>
                <div className={styles.stepContent}>
                  <div className={styles.stepNumberBadge}>{step.number}</div>
                  <h2 className={styles.stepTitle}>{step.title}</h2>
                  <p className={styles.stepDesc}>{step.description}</p>
                  <ul className={styles.stepDetails}>
                    {step.details.map((d) => (
                      <li key={d} className={styles.stepDetail}>
                        <span className={styles.stepCheck}>✓</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.stepIllusWrapper}>
                  {i < steps.length - 1 && <div className={styles.stepConnector} />}
                  {step.illustration}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.faqSection}>
          <div className={styles.faqInner}>
            <div className={styles.faqHeader}>
              <div className={styles.faqLabel}>FAQ</div>
              <h2 className={styles.faqTitle}>Common questions</h2>
            </div>
            <div className={styles.faqList}>
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className={`${styles.faqItem} ${openFaq === i ? styles.faqItemOpen : ""}`}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <div className={styles.faqQ}>
                    {faq.q}
                    <span className={styles.faqChevron}>{openFaq === i ? "−" : "+"}</span>
                  </div>
                  {openFaq === i && <div className={styles.faqA}>{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaGlow} />
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>Ready to get started?</h2>
            <p className={styles.ctaDesc}>
              Join businesses across Nigeria automating their WhatsApp customer service with D-Zero AI.
            </p>
            <div className={styles.ctaButtons}>
              <Link href="/signup" className={styles.ctaPrimary}>
                Start Free Trial
              </Link>
              <Link href="/pricing" className={styles.ctaSecondary}>
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
