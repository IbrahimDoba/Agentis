import Link from "next/link"
import { HeroChat } from "./HeroChat"
import { LiveStats } from "./LiveStats"
import type { PublicStats } from "@/lib/queries/publicStats"
import styles from "./Hero.module.css"

export function Hero({ stats }: { stats: PublicStats | null }) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <h1 className={styles.h1}>
            Your WhatsApp replies
            <br />
            while you sleep
          </h1>

          <p className={styles.subtitle}>
            An AI agent for Nigerian businesses that answers questions, quotes your prices and captures leads on your
            WhatsApp number, day and night
          </p>

          <div className={styles.ctas}>
            <Link href="/signup" className={styles.ctaPrimary}>Start free</Link>
            <Link href="https://youtu.be/tkrXSJWvLv0?si=GD9Op0d3KqDXgAVg" target="_blank" rel="noopener noreferrer" className={styles.ctaSecondary}>
              Watch how it works
            </Link>
          </div>
        </div>

        <HeroChat />
      </div>

      <LiveStats initial={stats} />
    </section>
  )
}

export default Hero
