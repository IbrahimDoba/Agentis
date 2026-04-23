"use client"
import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

const starterMonthly = {
  price: "₦50,000",
  priceNote: "/month",
  annualPrice: "₦40,000",
  annualNote: "/month, billed annually",
}

const proMonthly = {
  price: "₦85,000",
  priceNote: "/month",
  annualPrice: "₦68,000",
  annualNote: "/month, billed annually",
}

const starterFeatures = [
  { text: "1 AI WhatsApp Agent", included: true },
  { text: "60,000 credits/month (~923 text convos @ 13 AI msgs)", included: true },
  { text: "Dailzero AI usage: 5 credits/text, 8 credits/image", included: true },
  { text: "Text + image responses", included: true },
  { text: "Advanced FAQ handling", included: true },
  { text: "Business hours configuration", included: true },
  { text: "Custom greeting & sign-off", included: true },
  { text: "Conversation monitoring dashboard", included: true },
  { text: "Email support", included: true },
  { text: "7-day free trial", included: true },
  { text: "₦1,000 per 1,000 extra credits", included: true },
  { text: "Voice call capability", included: false },
  { text: "Advanced AI personality", included: false },
  { text: "Multi-language support", included: false },
  { text: "Priority support", included: false },
  { text: "Advanced analytics", included: false },
]

const proFeatures = [
  { text: "2 AI WhatsApp Agents", included: true },
  { text: "100,000 credits/month (~1,538 text convos @ 13 AI msgs)", included: true },
  { text: "Dailzero AI usage: 5 credits/text, 8 credits/image", included: true },
  { text: "Text + image + media sending", included: true },
  { text: "Automated follow-up messages", included: true },
  { text: "Advanced AI with custom personality", included: true },
  { text: "Multi-language support (English + any)", included: true },
  { text: "Priority support (24hr response)", included: true },
  { text: "Advanced analytics & insights", included: true },
  { text: "Custom response guidelines", included: true },
  { text: "7-day free trial", included: true },
  { text: "₦800 per 1,000 extra credits", included: true },
]

const faqs = [
  {
    q: "Is there a free trial?",
    a: "Yes! Both the Starter and Pro plans come with a 7-day free trial. You get full access to all features of your chosen plan. No credit card is required to start.",
  },
  {
    q: "Can I switch plans?",
    a: "Absolutely. You can upgrade from Starter to Pro at any time and the change takes effect immediately. Downgrading happens at the start of your next billing cycle.",
  },
  {
    q: "What happens if I exceed my credit limit?",
    a: "On Starter, additional credits beyond 60,000/month are charged at ₦1,000 per 1,000 credits. On Pro, overage is ₦800 per 1,000 credits. Dailzero AI usage is billed per successful AI send (5 credits per AI text, 8 per AI image).",
  },
  {
    q: "Do you offer custom plans?",
    a: "Yes! If your business needs more conversations, multiple agents, or custom integrations, we offer enterprise plans. Book a call with our team to discuss your requirements.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major Nigerian bank transfers, Paystack, and Flutterwave. Monthly billing happens automatically on your chosen payment method.",
  },
  {
    q: "Can I get a refund?",
    a: "If you're not satisfied within your first 7 days of a paid plan, we offer a full refund, no questions asked.",
  },
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>Pricing</div>
            <h1 className={styles.heroTitle}>
              Simple, transparent pricing
            </h1>
            <p className={styles.heroSubtitle}>
              Start with a 7-day free trial. No credit card required. Cancel anytime.
            </p>

            {/* Toggle */}
            <div className={styles.toggle}>
              <span className={!annual ? styles.toggleLabelActive : styles.toggleLabel}>Monthly</span>
              <button
                className={styles.toggleBtn}
                onClick={() => setAnnual(!annual)}
                aria-label="Toggle annual billing"
              >
                <div className={`${styles.toggleThumb} ${annual ? styles.toggleThumbOn : ""}`} />
              </button>
              <span className={annual ? styles.toggleLabelActive : styles.toggleLabel}>
                Annual
                <span className={styles.saveBadge}>Save 20%</span>
              </span>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className={styles.plansSection}>
          <div className={styles.plansGrid}>
            {/* Starter */}
            <div className={styles.planCard}>
              <div className={styles.planName}>Starter</div>
              <div className={styles.planPrice}>
                {annual ? starterMonthly.annualPrice : starterMonthly.price}
                <span className={styles.planPriceNote}>
                  {annual ? starterMonthly.annualNote : starterMonthly.priceNote}
                </span>
              </div>
              <p className={styles.planDesc}>
                Perfect for small businesses getting started with AI-powered WhatsApp customer service.
              </p>
              <Link href="/signup" className={`${styles.planBtn} ${styles.planBtnOutline}`}>
                Start 7-Day Free Trial
              </Link>
              <div className={styles.planDivider} />
              <ul className={styles.planFeatures}>
                {starterFeatures.map((f) => (
                  <li key={f.text} className={`${styles.planFeature} ${!f.included ? styles.planFeatureDimmed : ""}`}>
                    <span className={f.included ? styles.planCheck : styles.planCross}>
                      {f.included ? "✓" : "✕"}
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className={`${styles.planCard} ${styles.planCardPro}`}>
              <div className={styles.planPopularBadge}>Most Popular</div>
              <div className={styles.planName}>Pro</div>
              <div className={styles.planPrice}>
                {annual ? proMonthly.annualPrice : proMonthly.price}
                <span className={styles.planPriceNote}>
                  {annual ? proMonthly.annualNote : proMonthly.priceNote}
                </span>
              </div>
              <p className={styles.planDesc}>
                For growing businesses that need advanced AI, higher volume, and priority support.
              </p>
              <Link href="/signup" className={`${styles.planBtn} ${styles.planBtnSolid}`}>
                Start 7-Day Free Trial
              </Link>
              <div className={styles.planDivider} />
              <ul className={styles.planFeatures}>
                {proFeatures.map((f) => (
                  <li key={f.text} className={styles.planFeature}>
                    <span className={styles.planCheck}>✓</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Enterprise nudge */}
          <div className={styles.enterpriseCard}>
            <div className={styles.enterpriseLeft}>
              <div className={styles.enterpriseTitle}>Need more? Let's talk.</div>
              <div className={styles.enterpriseDesc}>
                Custom conversation limits, multiple agents, dedicated support, and API access — built for high-volume businesses.
              </div>
            </div>
            <Link href="/contact" className={styles.enterpriseBtn}>
              Book a Free Demo
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </section>

        {/* Comparison table */}
        <section className={styles.comparisonSection}>
          <div className={styles.comparisonInner}>
            <h2 className={styles.comparisonTitle}>Compare Plans</h2>
            <div className={styles.comparisonTable}>
              <div className={styles.comparisonHeader}>
                <div className={styles.comparisonFeatureCol}>Feature</div>
                <div className={styles.comparisonPlanCol}>Starter</div>
                <div className={`${styles.comparisonPlanCol} ${styles.comparisonPlanColPro}`}>Pro</div>
              </div>
              {[
                ["Monthly Credits", "60,000 (~923 text convos)", "100,000 (~1,538 text convos)"],
                ["Credit Burn", "5 text / 8 image", "5 text / 8 image"],
                ["Overage Rate", "₦1,000 / 1k credits", "₦800 / 1k credits"],
                ["Response Type", "Text + Image", "Text + Image + Media"],
                ["Media Sending", "✓ Images", "✓ Images, PDFs"],
                ["FAQ Handling", "Advanced", "Advanced AI"],
                ["Follow-up Messages", "—", "✓ Automated"],
                ["AI Personality", "Standard", "Fully customisable"],
                ["Languages", "English", "English + any language"],
                ["Dashboard", "✓ Basic", "✓ Advanced analytics"],
                ["Support", "Email (48hr)", "Priority (24hr)"],
                ["Free Trial", "7 days", "7 days"],
              ].map(([feature, starter, pro]) => (
                <div key={feature} className={styles.comparisonRow}>
                  <div className={styles.comparisonFeatureCol}>{feature}</div>
                  <div className={styles.comparisonPlanCol}>{starter}</div>
                  <div className={`${styles.comparisonPlanCol} ${styles.comparisonPlanColPro}`}>{pro}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className={styles.faqSection}>
          <div className={styles.faqInner}>
            <div className={styles.faqLabel}>FAQ</div>
            <h2 className={styles.faqTitle}>Pricing questions</h2>
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

        {/* Bottom CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaGlow} />
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>Not sure which plan?</h2>
            <p className={styles.ctaDesc}>
              Book a free 30-minute demo and we'll help you choose the right plan for your business.
            </p>
            <Link href="/contact" className={styles.ctaBtn}>
              Book a Free Demo
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
