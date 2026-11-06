import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getTenant, getTenantBranding } from "@/lib/tenant"
import { BrandProvider } from "@/components/BrandProvider"
import { Ticks } from "@/components/landing/Ticks"
import { getPublicStats } from "@/lib/queries/publicStats"
import styles from "./page.module.css"
import { Navbar } from "@/components/landing/Navbar"
import { Hero } from "@/components/landing/Hero"
import { Features } from "@/components/landing/Features"
import { HowItWorks } from "@/components/landing/HowItWorks"
import { Footer } from "@/components/landing/Footer"
import { PLAN_PRICES, CREDITS_NOTE, formatNaira } from "@/lib/plans"
import { PAYG_DEFAULT_NGN_PER_CREDIT } from "@/lib/credits"

export const metadata: Metadata = {
  title: "Dailzero: WhatsApp AI agents for Nigerian businesses",
  openGraph: { title: "Dailzero: WhatsApp AI agents for Nigerian businesses", siteName: "Dailzero" },
  twitter: { title: "Dailzero: WhatsApp AI agents for Nigerian businesses" },
}

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
    role: "Founder, Mama’s Kitchen Abuja",
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

export default async function LandingPage() {
  // White-label: a reseller’s domain has no Dailzero marketing — send visitors
  // straight to her branded signup. The platform tenant keeps the landing page.
  const tenant = await getTenant()
  if (tenant.id !== "platform") redirect("/signup")

  // Rendered server-side so the hero counters are already correct on first
  // paint (and with JS off). They keep ticking from /api/public/stats after
  // that. Both read the same 60s cache, so this is not a query per visitor.
  const [stats, branding] = await Promise.all([getPublicStats(), getTenantBranding()])

  return (
    // The whole page’s palette lives on this wrapper, so the app’s global tokens
    // stay as they are. The nested provider names the product Dailzero here only.
    <BrandProvider branding={{ ...branding, appName: "Dailzero" }}>
      <div className={styles.home}>
        <Navbar />
        <Hero stats={stats} />
        <Features />
        <HowItWorks />

        <section className={styles.testimonialsSection}>
          <div className={styles.testimonialsInner}>
            <h2 className={styles.sectionTitle}>What business owners say</h2>
            <div className={styles.testimonialsGrid}>
              {testimonials.map((t) => (
                <figure key={t.name} className={styles.testimonialCard}>
                  <blockquote className={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className={styles.testimonialAuthor}>
                    <div className={styles.testimonialAvatar} aria-hidden="true">{t.initials}</div>
                    <div>
                      <div className={styles.testimonialName}>{t.name}</div>
                      <div className={styles.testimonialRole}>{t.role}</div>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.pricingSection}>
          <div className={styles.pricingInner}>
            <div className={styles.pricingHeader}>
              <h2 className={styles.sectionTitle}>Pricing</h2>
              <p className={styles.sectionSubtitle}>Start with a 7-day free trial. No credit card required.</p>
              <p className={styles.pricingCreditsNote}>{CREDITS_NOTE}</p>
            </div>

            <div className={styles.pricingGrid}>
              <div className={styles.pricingCard}>
                <div className={styles.pricingPlan}>Starter</div>
                <div className={styles.pricingPrice}>
                  {formatNaira(PLAN_PRICES.starter)}<span>/month</span>
                </div>
                <p className={styles.pricingDesc}>For small businesses getting started with an AI agent on WhatsApp</p>
                <ul className={styles.pricingFeatures}>
                  {[
                    "1 AI WhatsApp agent",
                    "60,000 credits/month (about 12,000 AI messages)",
                    "Text and image responses",
                    "Advanced FAQ handling",
                    "Conversation monitoring dashboard",
                    "Lead detection and customer memory",
                    "7-day free trial",
                  ].map((f) => (
                    <li key={f} className={styles.pricingFeature}>
                      <Ticks className={styles.pricingCheck} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/pricing" className={`${styles.pricingBtn} ${styles.pricingBtnOutline}`}>Start free trial</Link>
              </div>

              <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
                <div className={styles.pricingPlan}>
                  Pro
                  <span className={styles.pricingBadge}>Most popular</span>
                </div>
                <div className={styles.pricingPrice}>
                  {formatNaira(PLAN_PRICES.pro)}<span>/month</span>
                </div>
                <p className={styles.pricingDesc}>For growing businesses that need higher volume and more agents</p>
                <ul className={styles.pricingFeatures}>
                  {[
                    "2 AI WhatsApp agents",
                    "100,000 credits/month (about 20,000 AI messages)",
                    "Text, image and media sending",
                    "Automated follow-up messages",
                    "Multi-language support",
                    "Priority support and analytics",
                    "7-day free trial",
                  ].map((f) => (
                    <li key={f} className={styles.pricingFeature}>
                      <Ticks className={styles.pricingCheck} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/pricing" className={`${styles.pricingBtn} ${styles.pricingBtnSolid}`}>Start free trial</Link>
              </div>
            </div>

            <p className={styles.pricingCta}>
              Prefer no monthly commitment? Pay as you go from ₦{PAYG_DEFAULT_NGN_PER_CREDIT.toFixed(2)}/credit, valid for 12 months.{" "}
              <Link href="/pricing" className={styles.pricingCtaLink}>Compare all plans</Link>
            </p>
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>Your customers are messaging right now</h2>
            <p className={styles.ctaDesc}>Every unanswered WhatsApp message is a customer who may buy elsewhere</p>
            <div className={styles.ctaButtons}>
              <Link href="/signup" className={styles.ctaPrimary}>Start free trial</Link>
              <Link href="/how-it-works" className={styles.ctaSecondary}>See how it works</Link>
            </div>
            <p className={styles.ctaNote}>7-day free trial · No credit card required · Cancel anytime</p>
          </div>
        </section>

        <Footer />
      </div>
    </BrandProvider>
  )
}
