import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import styles from "./page.module.css"

// ─── Content data ───────────────────────────────────────────────────────────

const SOLUTIONS = {
  ecommerce: {
    label: "E-commerce & Retail",
    emoji: "🛍️",
    headline: "Turn Every WhatsApp Message Into a Sale",
    subheadline:
      "Your customers are already on WhatsApp. D-Zero AI answers product questions, tracks orders, and converts browsers into buyers — 24/7, without a support team.",
    painPoints: [
      {
        title: "Abandoned carts from slow replies",
        desc: "Customers ask about a product, wait hours for a reply, and buy from a competitor.",
      },
      {
        title: "Overwhelmed support staff",
        desc: "Your team spends all day answering the same questions about sizes, stock, and delivery.",
      },
      {
        title: "Leads lost outside business hours",
        desc: "Orders and enquiries that come in at night go unanswered until morning.",
      },
    ],
    features: [
      {
        title: "Instant product answers",
        desc: "The AI knows your full catalogue and answers availability, pricing, and spec questions immediately.",
      },
      {
        title: "Order status updates",
        desc: "Connect your backend and let customers check their order status without calling anyone.",
      },
      {
        title: "24/7 coverage",
        desc: "No shifts, no holidays. Your AI agent handles every message the moment it arrives.",
      },
      {
        title: "Lead capture",
        desc: "Every conversation is a potential lead — the AI qualifies and logs them automatically.",
      },
    ],
    stats: [
      { value: "3×", label: "Faster response time" },
      { value: "60%", label: "Reduction in support tickets" },
      { value: "24/7", label: "Always available" },
    ],
  },
  restaurants: {
    label: "Restaurants & Food",
    emoji: "🍽️",
    headline: "Fill More Tables. Answer Every Order. Zero Extra Staff.",
    subheadline:
      "From reservations to menu questions to delivery updates — D-Zero AI handles it all on WhatsApp so your team can focus on the food.",
    painPoints: [
      {
        title: "Missed reservations and calls",
        desc: "Customers try to book by WhatsApp and get no reply, then go elsewhere.",
      },
      {
        title: "Repetitive menu questions",
        desc: "Staff spend time answering 'Do you have a vegetarian option?' instead of serving tables.",
      },
      {
        title: "No after-hours bookings",
        desc: "You lose reservations made at night because no one is available to respond.",
      },
    ],
    features: [
      {
        title: "Automated reservations",
        desc: "Customers book a table directly on WhatsApp — date, time, party size, confirmed instantly.",
      },
      {
        title: "Menu Q&A",
        desc: "The AI answers questions about your menu, allergens, specials, and opening times.",
      },
      {
        title: "Order handling",
        desc: "For delivery or takeaway, the AI takes and confirms orders without a phone call.",
      },
      {
        title: "Reminders",
        desc: "Automatically send booking reminders to reduce no-shows.",
      },
    ],
    stats: [
      { value: "40%", label: "Fewer no-shows" },
      { value: "2×", label: "More reservations captured" },
      { value: "24/7", label: "Booking availability" },
    ],
  },
  "real-estate": {
    label: "Real Estate",
    emoji: "🏠",
    headline: "Qualify Every Lead. Book Every Viewing. Sleep at Night.",
    subheadline:
      "D-Zero AI responds to property enquiries instantly, qualifies buyers and renters, and schedules viewings — so you focus on closing deals.",
    painPoints: [
      {
        title: "Leads going cold overnight",
        desc: "A buyer enquires about a property at 10pm and hears back the next morning — they've already moved on.",
      },
      {
        title: "Time wasted on unqualified leads",
        desc: "Agents spend hours with tyre-kickers who aren't serious buyers or renters.",
      },
      {
        title: "Slow response to listing enquiries",
        desc: "High volume listings mean some enquiries slip through the cracks entirely.",
      },
    ],
    features: [
      {
        title: "Instant lead response",
        desc: "Every WhatsApp enquiry gets an immediate, personalised reply — day or night.",
      },
      {
        title: "Lead qualification",
        desc: "The AI asks the right questions — budget, timeline, location — so you only talk to serious prospects.",
      },
      {
        title: "Viewing scheduling",
        desc: "Prospects book viewings directly through WhatsApp without any back-and-forth.",
      },
      {
        title: "Listing knowledge",
        desc: "The AI knows your full property portfolio and answers questions about specs, price, and availability.",
      },
    ],
    stats: [
      { value: "5×", label: "More leads responded to" },
      { value: "70%", label: "Time saved on qualification" },
      { value: "24/7", label: "Instant responses" },
    ],
  },
  healthcare: {
    label: "Healthcare & Clinics",
    emoji: "🏥",
    headline: "Give Every Patient an Instant, Helpful Response",
    subheadline:
      "D-Zero AI handles appointment booking, FAQs, and follow-ups on WhatsApp — so your front desk can focus on patients in the clinic.",
    painPoints: [
      {
        title: "Overloaded receptionists",
        desc: "Your front desk spends most of the day on the phone booking and rescheduling appointments.",
      },
      {
        title: "Patients left waiting for replies",
        desc: "Queries about services, costs, and availability sit unanswered for hours.",
      },
      {
        title: "No-shows and last-minute cancellations",
        desc: "Patients forget appointments, leaving gaps in your schedule.",
      },
    ],
    features: [
      {
        title: "Appointment booking",
        desc: "Patients book, reschedule, or cancel directly on WhatsApp — synced with your schedule.",
      },
      {
        title: "Service and pricing info",
        desc: "The AI answers questions about your services, doctors, costs, and accepted insurance.",
      },
      {
        title: "Automated reminders",
        desc: "Reduce no-shows with automatic appointment reminders sent via WhatsApp.",
      },
      {
        title: "After-hours coverage",
        desc: "Patients can interact with your clinic outside office hours without any staff involvement.",
      },
    ],
    stats: [
      { value: "50%", label: "Fewer no-shows" },
      { value: "80%", label: "Queries handled automatically" },
      { value: "24/7", label: "Patient availability" },
    ],
  },
  logistics: {
    label: "Logistics & Delivery",
    emoji: "🚚",
    headline: "Keep Every Customer Informed. Every Step of the Way.",
    subheadline:
      "D-Zero AI gives your customers real-time delivery updates and handles tracking queries on WhatsApp — without adding to your support load.",
    painPoints: [
      {
        title: "High volume of 'where is my order?' queries",
        desc: "Your support team spends most of the day answering tracking questions they didn't need to be asked.",
      },
      {
        title: "Delayed responses frustrate customers",
        desc: "Customers are anxious about their deliveries and get no update until they call.",
      },
      {
        title: "Costly support operations",
        desc: "Scaling support to handle delivery queries is expensive and slow.",
      },
    ],
    features: [
      {
        title: "Real-time tracking",
        desc: "Connect your system and let the AI give customers live delivery status on WhatsApp.",
      },
      {
        title: "Proactive updates",
        desc: "Automatically notify customers of dispatch, delays, and delivery confirmations.",
      },
      {
        title: "Query handling",
        desc: "The AI handles estimated arrival times, address changes, and delivery exceptions.",
      },
      {
        title: "Escalation",
        desc: "Complex issues are flagged and escalated to a human agent automatically.",
      },
    ],
    stats: [
      { value: "75%", label: "Fewer support tickets" },
      { value: "4×", label: "Faster query resolution" },
      { value: "24/7", label: "Customer updates" },
    ],
  },
  finance: {
    label: "Financial Services",
    emoji: "💰",
    headline: "Answer Every Customer Query. Capture Every Lead. Securely.",
    subheadline:
      "D-Zero AI handles product enquiries, account FAQs, and lead qualification for financial services businesses on WhatsApp.",
    painPoints: [
      {
        title: "High volume of repetitive queries",
        desc: "Customers ask the same questions about rates, products, and eligibility all day.",
      },
      {
        title: "Slow lead response times",
        desc: "Potential customers enquire about loans or investment products and wait too long for a reply.",
      },
      {
        title: "Support costs scaling with customers",
        desc: "Adding customers means adding support staff — an unsustainable model.",
      },
    ],
    features: [
      {
        title: "Product Q&A",
        desc: "The AI answers questions about your financial products, rates, and eligibility criteria.",
      },
      {
        title: "Lead qualification",
        desc: "Capture and qualify leads — income, product interest, timeline — before your team gets involved.",
      },
      {
        title: "Account FAQs",
        desc: "Handle common questions about account management, limits, and processes automatically.",
      },
      {
        title: "Secure and compliant",
        desc: "No sensitive data is stored in the conversation — the AI directs customers to secure channels.",
      },
    ],
    stats: [
      { value: "3×", label: "More leads qualified" },
      { value: "65%", label: "Support cost reduction" },
      { value: "24/7", label: "Always available" },
    ],
  },
  "customer-support": {
    label: "Customer Support",
    emoji: "💬",
    headline: "24/7 Customer Support. Zero Extra Headcount.",
    subheadline:
      "D-Zero AI answers every WhatsApp message instantly — resolving common queries, escalating complex ones, and keeping your customers happy around the clock.",
    painPoints: [
      {
        title: "Support team overwhelmed",
        desc: "Your team can't keep up with the volume of incoming messages.",
      },
      {
        title: "Long response times",
        desc: "Customers wait hours for simple answers they need immediately.",
      },
      {
        title: "High support costs",
        desc: "Hiring more agents to handle volume is expensive and slow to scale.",
      },
    ],
    features: [
      {
        title: "Instant responses",
        desc: "Every message gets a reply in seconds — no queues, no wait times.",
      },
      {
        title: "Knowledge base Q&A",
        desc: "Upload your docs and FAQs — the AI answers from your exact content.",
      },
      {
        title: "Smart escalation",
        desc: "Complex issues are automatically flagged for a human to handle.",
      },
      {
        title: "Conversation history",
        desc: "Every interaction is logged and searchable from your D-Zero dashboard.",
      },
    ],
    stats: [
      { value: "90%", label: "Queries resolved automatically" },
      { value: "< 1s", label: "Average response time" },
      { value: "24/7", label: "Coverage" },
    ],
  },
  "lead-generation": {
    label: "Lead Generation",
    emoji: "🔥",
    headline: "Never Miss a Lead Again.",
    subheadline:
      "D-Zero AI captures, qualifies, and logs every inbound WhatsApp lead — so your sales team only talks to prospects who are ready to buy.",
    painPoints: [
      {
        title: "Leads going cold from slow replies",
        desc: "The first business to reply wins the customer — slow responses lose deals.",
      },
      {
        title: "Unqualified leads wasting sales time",
        desc: "Your team spends hours with prospects who aren't serious.",
      },
      {
        title: "No system for tracking enquiries",
        desc: "Leads come in on WhatsApp and fall through the cracks.",
      },
    ],
    features: [
      {
        title: "Instant lead response",
        desc: "Every enquiry gets an immediate, intelligent reply — capturing interest before it fades.",
      },
      {
        title: "Automatic qualification",
        desc: "The AI asks the right questions and scores leads before passing them to your team.",
      },
      {
        title: "Lead logging",
        desc: "Every qualified lead is captured in your D-Zero dashboard automatically.",
      },
      {
        title: "Follow-up sequences",
        desc: "Automated follow-ups keep warm leads engaged until they're ready.",
      },
    ],
    stats: [
      { value: "5×", label: "More leads captured" },
      { value: "60%", label: "Better lead quality" },
      { value: "< 1s", label: "First response time" },
    ],
  },
  "appointment-booking": {
    label: "Appointment Booking",
    emoji: "📅",
    headline: "Let Customers Book Directly on WhatsApp.",
    subheadline:
      "D-Zero AI handles your entire booking flow on WhatsApp — no forms, no phone tag, no back-and-forth.",
    painPoints: [
      {
        title: "Bookings lost to friction",
        desc: "Customers want to book on WhatsApp but have to fill out a form or call instead.",
      },
      {
        title: "Double-bookings and scheduling errors",
        desc: "Manual booking management leads to costly mistakes.",
      },
      {
        title: "No-shows with no reminders",
        desc: "Customers forget appointments because no one followed up.",
      },
    ],
    features: [
      {
        title: "Conversational booking",
        desc: "Customers book in natural conversation — date, time, service — confirmed instantly.",
      },
      {
        title: "Availability checking",
        desc: "The AI knows your schedule and only offers available slots.",
      },
      {
        title: "Reminders",
        desc: "Automated reminders sent before every appointment reduce no-shows significantly.",
      },
      {
        title: "Rescheduling and cancellations",
        desc: "Customers manage their own bookings without needing to call.",
      },
    ],
    stats: [
      { value: "40%", label: "Fewer no-shows" },
      { value: "3×", label: "More bookings captured" },
      { value: "24/7", label: "Booking availability" },
    ],
  },
  broadcasts: {
    label: "Broadcasts & Campaigns",
    emoji: "📢",
    headline: "Reach Your Entire Customer Base on WhatsApp.",
    subheadline:
      "Send targeted broadcast messages, promotions, and updates to your WhatsApp contacts — and let D-Zero AI handle every reply automatically.",
    painPoints: [
      {
        title: "Email open rates are terrible",
        desc: "WhatsApp has 98% open rates vs 20% for email — you're reaching the wrong channel.",
      },
      {
        title: "Broadcasts that trigger conversations you can't handle",
        desc: "You send a campaign and get flooded with replies your team can't manage.",
      },
      {
        title: "No way to target specific customers",
        desc: "You blast everyone the same message instead of targeting by product interest or behaviour.",
      },
    ],
    features: [
      {
        title: "Broadcast campaigns",
        desc: "Send targeted messages to your opted-in WhatsApp audience in minutes.",
      },
      {
        title: "AI-handled replies",
        desc: "Every reply to your broadcast is handled automatically — no team needed.",
      },
      {
        title: "Personalisation",
        desc: "Messages personalised with customer name, product interest, and purchase history.",
      },
      {
        title: "Campaign analytics",
        desc: "Track delivery, opens, and conversions from your D-Zero dashboard.",
      },
    ],
    stats: [
      { value: "98%", label: "WhatsApp open rate" },
      { value: "5×", label: "Higher engagement vs email" },
      { value: "100%", label: "Replies handled by AI" },
    ],
  },
} as const

type Slug = keyof typeof SOLUTIONS

// ─── Static params ───────────────────────────────────────────────────────────

export function generateStaticParams() {
  return (Object.keys(SOLUTIONS) as Slug[]).map((slug) => ({ slug }))
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const solution = SOLUTIONS[slug as Slug]
  if (!solution) return {}
  return {
    title: `${solution.label} | D-Zero AI`,
    description: solution.subheadline,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SolutionPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const solution = SOLUTIONS[slug as Slug]
  if (!solution) notFound()

  return (
    <main className={styles.main}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <span>{solution.emoji}</span>
            {solution.label}
          </div>
          <h1 className={styles.heroTitle}>{solution.headline}</h1>
          <p className={styles.heroSubheadline}>{solution.subheadline}</p>
          <div className={styles.heroCtas}>
            <Link href="/signup" className={styles.ctaPrimary}>
              Get Started Free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/how-it-works" className={styles.ctaGhost}>
              See how it works
            </Link>
          </div>
        </div>
        <div className={styles.heroDivider} />
      </section>

      {/* ── Pain Points ── */}
      <section className={styles.painSection}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>The Challenge</div>
          <h2 className={styles.sectionTitle}>Sound familiar?</h2>
          <div className={styles.painGrid}>
            {solution.painPoints.map((point) => (
              <div key={point.title} className={styles.painCard}>
                <div className={styles.painIconWrap}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <circle cx="9" cy="9" r="8" stroke="var(--danger)" strokeWidth="1.5" />
                    <path d="M9 5.5v4M9 12h.01" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className={styles.painCardTitle}>{point.title}</div>
                  <div className={styles.painCardDesc}>{point.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.featuresSection}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>The Solution</div>
          <h2 className={styles.sectionTitle}>How D-Zero AI helps</h2>
          <div className={styles.featuresGrid}>
            {solution.features.map((feat) => (
              <div key={feat.title} className={styles.featureCard}>
                <div className={styles.featureIconWrap}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8l4 4 6-6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className={styles.featureCardTitle}>{feat.title}</div>
                  <div className={styles.featureCardDesc}>{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className={styles.statsSection}>
        <div className={styles.sectionInner}>
          <div className={styles.statsBar}>
            {solution.stats.map((stat) => (
              <div key={stat.label} className={styles.statItem}>
                <div className={styles.statValue}>{stat.value}</div>
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaGlow} />
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>
            Ready to automate your {solution.label.toLowerCase()} support?
          </h2>
          <p className={styles.ctaDesc}>
            Join businesses using D-Zero AI to handle WhatsApp conversations 24/7 — without adding headcount.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/signup" className={styles.ctaPrimary}>
              Get Started Free
            </Link>
            <Link href="/contact" className={styles.ctaSecondary}>
              Book a Demo
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
