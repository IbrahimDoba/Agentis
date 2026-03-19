import Link from "next/link"
import styles from "./page.module.css"
import { Navbar } from "@/components/landing/Navbar"
import { Hero } from "@/components/landing/Hero"
import { Features } from "@/components/landing/Features"
import { HowItWorks } from "@/components/landing/HowItWorks"
import { Footer } from "@/components/landing/Footer"

const testimonials = [
  {
    quote:
      "Before D-Zero AI, we missed dozens of WhatsApp messages every day. Now our agent handles everything while we sleep. Sales have gone up 40% since we launched.",
    name: "Tunde Adeyemi",
    role: "CEO, QuickStyle Lagos",
    initials: "TA",
  },
  {
    quote:
      "Our customers love that they get instant responses even at midnight. The agent knows our entire product catalogue and handles orders perfectly. Worth every kobo.",
    name: "Ngozi Okonkwo",
    role: "Founder, Mama's Kitchen Abuja",
    initials: "NO",
  },
  {
    quote:
      "We run a real estate agency and clients ask lots of questions. D-Zero AI handles the initial enquiries so my team only speaks to serious buyers. Game changer.",
    name: "Emeka Okafor",
    role: "MD, HomeFind Realty",
    initials: "EO",
  },
]

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />

      {/* Testimonials */}
      <section className={styles.testimonialsSection}>
        <div className={styles.testimonialsInner}>
          <div className={styles.testimonialsHeader}>
            <div className={styles.sectionLabel}>Testimonials</div>
            <h2 className={styles.sectionTitle}>Businesses that trust D-Zero AI</h2>
            <p className={styles.sectionSubtitle}>
              Real results from real businesses across Nigeria.
            </p>
          </div>
          <div className={styles.testimonialsGrid}>
            {testimonials.map((t) => (
              <div key={t.name} className={styles.testimonialCard}>
                <div className={styles.testimonialStars}>
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={styles.star}>★</span>
                  ))}
                </div>
                <p className={styles.testimonialQuote}>"{t.quote}"</p>
                <div className={styles.testimonialAuthor}>
                  <div className={styles.testimonialAvatar}>{t.initials}</div>
                  <div>
                    <div className={styles.testimonialName}>{t.name}</div>
                    <div className={styles.testimonialRole}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className={styles.pricingSection}>
        <div className={styles.pricingInner}>
          <div className={styles.pricingHeader}>
            <div className={styles.sectionLabel}>Pricing</div>
            <h2 className={styles.sectionTitle}>Simple, transparent pricing</h2>
            <p className={styles.sectionSubtitle}>
              Start with a 7-day free trial. No credit card required.
            </p>
          </div>

          <div className={styles.pricingGrid}>
            {/* Starter */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingPlan}>Starter</div>
              <div className={styles.pricingPrice}>
                ₦50,000<span>/month</span>
              </div>
              <p className={styles.pricingDesc}>
                Perfect for small businesses getting started with AI-powered customer service.
              </p>
              <ul className={styles.pricingFeatures}>
                {[
                  "1 AI WhatsApp Agent",
                  "Up to 1,000 conversations/month",
                  "Text responses only",
                  "Basic FAQ handling",
                  "Conversation monitoring dashboard",
                  "7-day free trial",
                ].map((f) => (
                  <li key={f} className={styles.pricingFeature}>
                    <span className={styles.pricingCheck}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className={`${styles.pricingBtn} ${styles.pricingBtnOutline}`}>
                Start Free Trial
              </Link>
            </div>

            {/* Pro */}
            <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
              <div className={styles.pricingBadge}>Most Popular</div>
              <div className={styles.pricingPlan}>Pro</div>
              <div className={styles.pricingPrice}>
                ₦100,000<span>/month</span>
              </div>
              <p className={styles.pricingDesc}>
                For growing businesses that need advanced AI capabilities and higher volume.
              </p>
              <ul className={styles.pricingFeatures}>
                {[
                  "1 AI WhatsApp Agent",
                  "Up to 5,000 conversations/month",
                  "Text + Voice call capability",
                  "Advanced AI with custom personality",
                  "Multi-language support",
                  "Priority support + analytics",
                  "7-day free trial",
                ].map((f) => (
                  <li key={f} className={styles.pricingFeature}>
                    <span className={styles.pricingCheck}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/pricing" className={`${styles.pricingBtn} ${styles.pricingBtnSolid}`}>
                Start Free Trial
              </Link>
            </div>
          </div>

          <div className={styles.pricingCta}>
            <Link href="/pricing" className={styles.pricingCtaLink}>
              Compare plans in full detail →{" "}
              <span>See full pricing</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaGlow} />
        <div className={styles.ctaInner}>
          <div className={styles.ctaLabel}>Get Started</div>
          <h2 className={styles.ctaTitle}>
            Your customers are messaging right now
          </h2>
          <p className={styles.ctaDesc}>
            Every unanswered WhatsApp message is a missed opportunity. Deploy your AI agent today and
            start responding to every customer, every time — automatically.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/signup" className={styles.ctaPrimary}>
              Start Free Trial
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/how-it-works" className={styles.ctaSecondary}>
              Book a Demo
            </Link>
          </div>
          <p className={styles.ctaNote}>7-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      <Footer />
    </>
  )
}
