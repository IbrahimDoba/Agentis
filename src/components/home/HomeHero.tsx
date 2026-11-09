import Link from "next/link"
import { ArrowRight, Play } from "lucide-react"
import { formatCount } from "@/lib/odometer"
import type { PublicStats } from "@/lib/queries/publicStats"
import { LineWave } from "./LineWave"
import { TypedWord } from "./TypedWord"
import { HeroChat } from "./HeroChat"
import styles from "./Hero.module.css"

const WORDS = ["customer message", "11pm enquiry", "price question", "new order"]

export function HomeHero({ stats }: { stats: PublicStats | null }) {
  return (
    <section className={styles.hero}>
      <LineWave className={styles.wave} />
      <div className={styles.inner}>
        <div className={styles.copy}>
          {stats && stats.aiMessages > 0 && (
            <div className={styles.live}>
              <span className={styles.liveDot} aria-hidden="true" />
              <span className={styles.liveCount}>{formatCount(stats.aiMessages)}</span>
              AI replies sent on WhatsApp
            </div>
          )}

          <h1 className={styles.h1}>
            <span className={styles.line1}>
              Every <TypedWord words={WORDS} className={styles.typed} caretClassName={styles.caret} />
            </span>
            <br />
            answered<span className={styles.dot}>.</span>
          </h1>

          <p className={styles.sub}>
            An AI agent that replies to your WhatsApp customers in seconds, day and night, and hands over to you when it matters.
          </p>

          <div className={styles.ctas}>
            <Link href="/signup" className={styles.primary}>
              Start free trial
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              href="https://youtu.be/tkrXSJWvLv0"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondary}
            >
              <Play size={14} aria-hidden="true" />
              Watch how it works
            </Link>
          </div>
        </div>

        <HeroChat />
      </div>
    </section>
  )
}
