import type { Metadata } from "next"
import Link from "next/link"
import { GUIDE_CATEGORIES, GUIDE_TOPICS } from "@/lib/guide-content"
import styles from "./guide.module.css"

export const metadata: Metadata = {
  title: "Guide — D-Zero AI",
  description: "Complete guide to setting up and operating D-Zero AI — every page, tab, and feature.",
}

export default function GuideIndexPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>D-Zero AI Guide</h1>
        <p className={styles.subtitle}>
          Everything you need to set up, run, and improve your WhatsApp AI agents.
          Read top-to-bottom for a full walkthrough, or jump to the topic you need.
        </p>
      </header>

      {GUIDE_CATEGORIES.map((category) => {
        const topics = GUIDE_TOPICS.filter((t) => t.category === category.id)
        if (topics.length === 0) return null
        return (
          <section key={category.id} className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{category.label}</h2>
              <p className={styles.sectionDesc}>{category.description}</p>
            </div>
            <div className={styles.grid}>
              {topics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/dashboard/guide/${topic.slug}`}
                  className={styles.card}
                >
                  <span className={styles.cardEmoji}>{topic.emoji}</span>
                  <span className={styles.cardTitle}>{topic.title}</span>
                  <span className={styles.cardIntro}>{topic.intro}</span>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
