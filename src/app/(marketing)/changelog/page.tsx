import type { Metadata } from "next"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import updates from "./updates.json"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "Changelog — D-Zero AI",
  description:
    "Every update, improvement, and new feature shipped to D-Zero AI — documented as we build the future of WhatsApp AI agents for business.",
  openGraph: {
    title: "Changelog — D-Zero AI",
    description:
      "Every update, improvement, and new feature shipped to D-Zero AI — documented as we build the future of WhatsApp AI agents for business.",
    url: "https://dailzero.com/changelog",
    siteName: "D-Zero AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Changelog — D-Zero AI",
    description:
      "Every update, improvement, and new feature shipped to D-Zero AI — documented as we build the future of WhatsApp AI agents for business.",
  },
}

const tagStyles: Record<string, string> = {
  green: styles.tagGreen,
  blue: styles.tagBlue,
  orange: styles.tagOrange,
}

export default function ChangelogPage() {
  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>Changelog</div>
            <h1 className={styles.heroTitle}>
              What&apos;s new in <span>D-Zero AI</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Every update, improvement, and new feature — documented as we ship it.
            </p>
          </div>
        </section>

        {/* Timeline */}
        <section className={styles.timeline}>
          <div className={styles.timelineInner}>
            {updates.map((update, i) => (
              <div key={i} className={styles.entry}>
                <div className={styles.entryLeft}>
                  <div className={styles.entryDate}>{update.date}</div>
                  <span className={`${styles.tag} ${tagStyles[update.tagColor]}`}>
                    {update.tag}
                  </span>
                </div>

                <div className={styles.entryConnector}>
                  <div className={styles.entryDot} />
                  {i < updates.length - 1 && <div className={styles.entryLine} />}
                </div>

                <div className={styles.entryContent}>
                  <h2 className={styles.entryTitle}>{update.title}</h2>
                  <p className={styles.entryDesc}>{update.description}</p>
                  <ul className={styles.entryBullets}>
                    {update.bullets.map((b, j) => (
                      <li key={j} className={styles.entryBullet}>
                        <span className={styles.bulletCheck}>✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
