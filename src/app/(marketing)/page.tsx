import { redirect } from "next/navigation"
import { getTenant } from "@/lib/tenant"
import { getPublicStats } from "@/lib/queries/publicStats"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { HomeHero } from "@/components/home/HomeHero"
import { NumbersStrip, Products, Smarts, Steps, Pricing, ClosingCta } from "@/components/home/Sections"
import { Testimonials } from "@/components/home/Testimonials"
import { geist, geistMono } from "@/components/home/fonts"
import styles from "@/components/home/Home.module.css"

const testimonials = [
  {
    quote:
      "Before D-Zero AI, we missed dozens of WhatsApp messages every day. Now our agent handles everything while we sleep. Sales have gone up 40% since we launched.",
    name: "Tunde Adeyemi",
    role: "CEO, QuickStyle Lagos",
  },
  {
    quote:
      "Our customers love that they get instant responses even at midnight. The agent knows our entire product catalogue and handles orders perfectly. Worth every kobo.",
    name: "Ngozi Okonkwo",
    role: "Founder, Mama's Kitchen Abuja",
  },
  {
    quote:
      "We run a real estate agency and clients ask lots of questions. D-Zero AI handles the initial enquiries so my team only speaks to serious buyers. Game changer.",
    name: "Emeka Okafor",
    role: "MD, HomeFind Realty",
  },
]

export default async function LandingPage() {
  // White-label: a reseller's domain has no Dailzero marketing — send visitors
  // straight to her branded signup. The platform tenant keeps the landing page.
  const tenant = await getTenant()
  if (tenant.id !== "platform") redirect("/signup")

  // Server-rendered so the hero and strip numbers are right on first paint.
  // Same 60s cache as /api/public/stats, so not a query per visitor.
  const stats = await getPublicStats()

  return (
    <div className={`${styles.page} ${geist.variable} ${geistMono.variable}`}>
      <Navbar />
      <HomeHero stats={stats} />
      <NumbersStrip stats={stats} />
      <Products />
      <Smarts />
      <Steps />
      <Testimonials items={testimonials} />
      <Pricing />
      <ClosingCta />
      <Footer />
    </div>
  )
}
