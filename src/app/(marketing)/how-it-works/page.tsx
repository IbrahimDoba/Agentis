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
            Dailzero
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
              <div className={styles.configAiTitle}>FAQs drafted for you</div>
              <div className={styles.configAiSub}>12 questions found in your recent chats</div>
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
              { label: "Account created", done: true },
              { label: "Email confirmed", done: true },
              { label: "QR code scanned", done: true },
              { label: "WhatsApp linked", done: true },
              { label: "Building your agent…", done: false, active: true },
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
            Your number stays on your phone. Your agent is drafted from your recent chats in about 5 minutes.
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
          <div className={styles.liveUptime}>AI on</div>
        </div>
        <div className={styles.liveMetrics}>
          <div className={styles.liveMetric}>
            <div className={styles.liveMetricVal}>248</div>
            <div className={styles.liveMetricLbl}>Today</div>
          </div>
          <div className={styles.liveMetric}>
            <div className={styles.liveMetricVal}>12</div>
            <div className={styles.liveMetricLbl}>Leads</div>
          </div>
          <div className={styles.liveMetric}>
            <div className={styles.liveMetricVal}>3</div>
            <div className={styles.liveMetricLbl}>Need you</div>
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
    title: "Create your account",
    description:
      "Sign up with your name, email and a password, then confirm your email with the code we send you. Your 7-day free trial comes with 1,000 credits and needs no card.",
    details: [
      "Takes about 2 minutes",
      "No approval step and no waiting",
      "No card needed for the trial",
      "No technical knowledge needed",
    ],
    illustration: <SignupIllustration />,
  },
  {
    number: "02",
    title: "Link your WhatsApp",
    description:
      "Scan a QR code or enter a pairing code on your phone, the same way you link WhatsApp Web. It works with the WhatsApp or WhatsApp Business number you already use, and your customers keep messaging the number they know.",
    details: [
      "Your number stays on your phone, in your app",
      "No Meta verification and no Meta message fees",
      "New numbers are warmed up before they send much",
      "Need Meta's official API instead? Our team sets it up with you",
    ],
    illustration: <SetupIllustration />,
  },
  {
    number: "03",
    title: "Your agent is drafted for you",
    description:
      "Once your number is linked, Dailzero reads your WhatsApp profile and recent chats and drafts your agent in about 5 minutes: what you sell, the questions customers ask and how you like to talk. You review it before it replies to anyone. You can also set it up by hand.",
    details: [
      "Products, prices and FAQs found from your own chats",
      "Choose the tone: friendly, professional, concise and more",
      "Add price lists, documents or your website",
      "The AI stays off until you have reviewed it",
    ],
    illustration: <ConfigureIllustration />,
  },
  {
    number: "04",
    title: "Go live and stay in control",
    description:
      "Your agent starts replying to customers in seconds, day and night. Every chat is in your dashboard. Reply from your phone or the dashboard and the AI pauses on that chat until you hand it back.",
    details: [
      "Every conversation in one dashboard",
      "Take over any chat with one reply",
      "Leads and appointments picked out for you",
      "Change products, prices and instructions anytime",
    ],
    illustration: <LiveIllustration />,
  },
]

const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes. Every new account gets a 7-day free trial with 1,000 credits, which is about 200 AI replies. No card is needed.",
  },
  {
    q: "How long does setup take?",
    a: "Most businesses are live the same day. Linking your number takes a few minutes, and your agent is drafted from your recent chats in about 5 minutes. There is no application review and nothing for our team to install.",
  },
  {
    q: "Do I need a WhatsApp Business account?",
    a: "No. Dailzero works with the WhatsApp or WhatsApp Business number you already use. You link it by QR code or pairing code. If your business needs Meta's official WhatsApp Business Platform, our team can set that route up with you.",
  },
  {
    q: "Can I customise what the AI says?",
    a: "Yes. You set the agent's tone, its instructions, your products and prices, and the topics it should or should not discuss. You can change any of it at any time.",
  },
  {
    q: "What happens when the AI can't answer?",
    a: "It hands the chat to you instead of guessing. The AI pauses on that chat and the conversation is marked in your dashboard as needing a person, so you can reply from the dashboard or your phone.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can move between Basic, Starter and Pro at any time. Upgrades take effect immediately, and downgrades apply at the start of your next billing cycle.",
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
              Dailzero is built for busy business owners. No developers, no application to wait on
              and no long onboarding. Four steps, and most businesses are live the same day.
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
              Join businesses across Nigeria automating their WhatsApp customer service with Dailzero.
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
