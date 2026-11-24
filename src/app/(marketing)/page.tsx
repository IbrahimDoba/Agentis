import { redirect } from "next/navigation"
import { getTenant } from "@/lib/tenant"
import { getPublicStats } from "@/lib/queries/publicStats"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { HomeHero } from "@/components/home/HomeHero"
import { NumbersStrip, Products, Smarts, Steps, Connect, Pricing, Faqs, ClosingCta } from "@/components/home/Sections"
import { Testimonials } from "@/components/home/Testimonials"
import { LiveCounters } from "@/components/home/LiveCounters"
import { geist, geistMono } from "@/components/home/fonts"
import styles from "@/components/home/Home.module.css"
import { JsonLd } from "@/components/JsonLd"
import { pageMetadata, homeJsonLd, HOME_FAQS, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo"

export const metadata = pageMetadata({
  title: `${SITE_NAME}: AI WhatsApp Agent for Nigerian Businesses`,
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
})

// Real words from customers, taken from their WhatsApp chats and voice notes
// with the team. Each business is named with its owner's agreement.
const testimonials = [
  {
    quote: "It's really, really working now. Wow. I'm going to subscribe. I really love this.",
    name: "Gracious Furniture Hub",
    role: "Furniture seller",
  },
  {
    quote: "What I love about the system is how natural it is. Nobody is going to know if it's AI or not.",
    name: "Usama Jibrin",
    role: "Business owner",
  },
  {
    quote: "So far so good. It's been awesome.",
    name: "Logion Media",
    role: "Media agency",
  },
]

export default async function LandingPage() {
  // White-label: a reseller's domain has no Dailzero marketing — send visitors
  // straight to her branded signup. The platform tenant keeps the landing page.
  const tenant = await getTenant()
  if (tenant.id !== "platform") redirect("/signup")

  // Server-rendered so the live counters are right on first paint.
  // Same 60s cache as /api/public/stats, so not a query per visitor.
  const counted = await getPublicStats()
  // A local database has no traffic, which hides the counters. Sample numbers
  // in development only, so the row can still be reviewed.
  const empty = !counted || counted.aiMessages + counted.leads + counted.conversations === 0
  const stats = process.env.NODE_ENV === "development" && empty
    ? { aiMessages: 184_392, conversations: 21_847, leads: 6_215 }
    : counted

  return (
    <div className={`${styles.page} ${geist.variable} ${geistMono.variable}`}>
      <JsonLd data={homeJsonLd()} />
      <Navbar />
      <HomeHero />
      <LiveCounters initial={stats} />
      <NumbersStrip />
      <Products />
      <Smarts />
      <Steps />
      <Connect />
      <Testimonials items={testimonials} />
      <Pricing />
      <Faqs items={HOME_FAQS} />
      <ClosingCta />
      <Footer />
    </div>
  )
}
