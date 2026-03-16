import Link from "next/link"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "About Us — D-Zero AI",
  description: "Learn about D-Zero AI — who we are, our mission, and the team building AI customer service for African businesses.",
}

const stats = [
  { num: "24/7", label: "Agent Uptime" },
  { num: "<1s", label: "Response Time" },
  { num: "100%", label: "WhatsApp Native" },
  { num: "0", label: "Missed Messages" },
]

const missionItems = [
  { icon: "🚀", title: "Instant Responses", desc: "No customer query goes unanswered — day or night, weekday or holiday." },
  { icon: "🧠", title: "Intelligent Context", desc: "Agents understand your business deeply, handling nuanced questions accurately." },
  { icon: "📈", title: "Business Growth", desc: "Free your team from repetitive queries so they can focus on high-value work." },
]

const values = [
  { icon: "🌍", title: "Built for Africa", desc: "We understand the Nigerian and African business environment and design specifically for it." },
  { icon: "⚡", title: "Simple & Powerful", desc: "Powerful AI technology packaged so simply that any business owner can use it." },
  { icon: "🤝", title: "Customer First", desc: "Every feature we build is driven by real feedback from the businesses we serve." },
  { icon: "🔁", title: "Always Improving", desc: "We iterate constantly, shipping improvements every week based on real-world use." },
]

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroBg} />
          <div className={styles.badge}>Our Story</div>
          <h1 className={styles.heroTitle}>
            Helping African businesses deliver{" "}
            <span>faster, smarter</span> customer service
          </h1>
          <p className={styles.heroDesc}>
            D-Zero AI was built to solve a simple but painful problem: businesses across Nigeria are losing customers because they can&apos;t respond to WhatsApp messages fast enough. We&apos;re here to change that.
          </p>
        </section>

        {/* Stats */}
        <div className={styles.stats}>
          {stats.map((s) => (
            <div key={s.label} className={styles.stat}>
              <div className={styles.statNum}>{s.num}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mission */}
        <section className={styles.mission}>
          <div className={styles.missionContent}>
            <div className={styles.sectionBadge}>Our Mission</div>
            <h2 className={styles.sectionTitle}>
              Zero missed customers. Zero missed opportunities.
            </h2>
            <p className={styles.sectionDesc}>
              Every day, thousands of Nigerian businesses lose potential customers to slow response times on WhatsApp. A customer sends a message, doesn&apos;t hear back for hours, and goes to a competitor.
            </p>
            <p className={styles.sectionDesc}>
              D-Zero AI deploys intelligent AI agents that handle customer conversations instantly — 24 hours a day, 7 days a week. Your customers get the instant response they expect. You get to focus on growing your business.
            </p>
          </div>
          <div className={styles.missionVisual}>
            {missionItems.map((item) => (
              <div key={item.title} className={styles.missionItem}>
                <div className={styles.missionItemIcon}>{item.icon}</div>
                <div>
                  <div className={styles.missionItemTitle}>{item.title}</div>
                  <div className={styles.missionItemDesc}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section className={styles.values}>
          <div className={styles.valuesInner}>
            <div className={styles.valuesHeader}>
              <div className={styles.sectionBadge}>What We Stand For</div>
              <h2 className={styles.sectionTitle}>Our values</h2>
            </div>
            <div className={styles.valuesGrid}>
              {values.map((v) => (
                <div key={v.title} className={styles.valueCard}>
                  <div className={styles.valueIcon}>{v.icon}</div>
                  <div className={styles.valueTitle}>{v.title}</div>
                  <div className={styles.valueDesc}>{v.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section className={styles.team}>
          <div className={styles.teamHeader}>
            <div className={styles.sectionBadge}>The Team</div>
            <h2 className={styles.sectionTitle}>The people behind D-Zero AI</h2>
          </div>
          <div className={styles.teamGrid}>
            {/* Founder */}
            <div className={styles.teamCard}>
              <div className={styles.teamAvatar}>I</div>
              <div className={styles.teamName}>Ibrahim Doba</div>
              <div className={styles.teamRole}>Founder & CEO</div>
              <div className={styles.teamBio}>
                Ibrahim built D-Zero AI after watching businesses across Nigeria struggle to keep up with customer messages on WhatsApp. He&apos;s obsessed with making AI accessible to every African business owner.
              </div>
              <div className={styles.teamLinks}>
                <a href="https://x.com/DobaIbrahim" target="_blank" rel="noopener noreferrer" className={styles.teamLink}>
                  𝕏 @DobaIbrahim
                </a>
                <a href="https://www.linkedin.com/in/ibrahimdoba/" target="_blank" rel="noopener noreferrer" className={styles.teamLink}>
                  LinkedIn
                </a>
              </div>
            </div>

            {/* Open roles */}
            <div className={`${styles.teamCard} ${styles.openRole}`}>
              <div className={styles.teamAvatar}>+</div>
              <div className={styles.teamName}>Full-Stack Engineer</div>
              <div className={styles.teamRole}>We&apos;re Hiring</div>
              <div className={styles.teamBio}>
                Help us build the infrastructure that powers AI customer service for businesses across Africa.
              </div>
              <Link href="/careers" className={styles.openRoleLink}>
                View open roles →
              </Link>
            </div>

            <div className={`${styles.teamCard} ${styles.openRole}`}>
              <div className={styles.teamAvatar}>+</div>
              <div className={styles.teamName}>Customer Success</div>
              <div className={styles.teamRole}>We&apos;re Hiring</div>
              <div className={styles.teamBio}>
                Be the first point of contact for our growing list of business clients. Help them succeed with D-Zero AI.
              </div>
              <Link href="/careers" className={styles.openRoleLink}>
                View open roles →
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>Ready to automate your customer service?</h2>
            <p className={styles.ctaDesc}>
              Join businesses across Nigeria using D-Zero AI to handle WhatsApp conversations 24/7.
            </p>
            <div className={styles.ctaButtons}>
              <Link href="/signup" className={styles.ctaPrimary}>Get Started →</Link>
              <Link href="/contact" className={styles.ctaSecondary}>Talk to Us</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
