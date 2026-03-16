import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "Careers — D-Zero AI",
  description: "Join D-Zero AI and help build AI customer service for African businesses.",
}

const benefits = [
  { icon: "🌍", title: "Remote-First", desc: "Work from anywhere in Africa. We believe great work happens anywhere." },
  { icon: "💰", title: "Competitive Pay", desc: "Salary that reflects your skills and experience, plus equity in what we're building." },
  { icon: "📚", title: "Learning Budget", desc: "We invest in your growth. Annual budget for courses, books, and conferences." },
  { icon: "🚀", title: "Real Impact", desc: "You'll build products used by real businesses across Nigeria from day one." },
  { icon: "⏰", title: "Flexible Hours", desc: "Deliver results on your schedule. We care about output, not clock-watching." },
  { icon: "🤝", title: "Tight-Knit Team", desc: "Join a small, ambitious team where your ideas directly shape the product." },
  { icon: "🏥", title: "Health Coverage", desc: "Health insurance for you and your family through our partner HMOs." },
  { icon: "✈️", title: "Team Retreats", desc: "Annual in-person team meetup for planning, bonding, and celebrating wins." },
]

export default function CareersPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroBg} />
          <div className={styles.badge}>Careers</div>
          <h1 className={styles.heroTitle}>
            Build the future of <span>customer service</span> in Africa
          </h1>
          <p className={styles.heroDesc}>
            We&apos;re a small, ambitious team on a mission to make AI-powered customer service accessible to every business in Africa. If that excites you, we&apos;d love to hear from you.
          </p>
        </section>

        {/* Benefits */}
        <section className={styles.benefits}>
          <div className={styles.benefitsInner}>
            <div className={styles.benefitsHeader}>
              <div className={styles.sectionBadge}>Why D-Zero AI</div>
              <h2 className={styles.sectionTitle}>Life at D-Zero AI</h2>
            </div>
            <div className={styles.benefitsGrid}>
              {benefits.map((b) => (
                <div key={b.title} className={styles.benefitCard}>
                  <div className={styles.benefitIcon}>{b.icon}</div>
                  <div className={styles.benefitTitle}>{b.title}</div>
                  <div className={styles.benefitDesc}>{b.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open Roles — empty state */}
        <section className={styles.roles}>
          <div className={styles.rolesHeader}>
            <h2 className={styles.rolesTitle}>Open Positions</h2>
          </div>

          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <div className={styles.emptyTitle}>No open positions right now</div>
            <p className={styles.emptyDesc}>
              We don&apos;t have any active listings at the moment, but we&apos;re always interested in talented people. Send us a general application and we&apos;ll keep you in mind.
            </p>
            <a
              href="mailto:support@dailzero.com?subject=General Application — D-Zero AI"
              className={styles.generalBtn}
            >
              Send a General Application
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
