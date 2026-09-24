"use client"
import dynamic from "next/dynamic"
import Link from "next/link"
import { LiveStats } from "./LiveStats"
import type { PublicStats } from "@/lib/queries/publicStats"
import styles from "./Hero.module.css"

const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => (
    <div className={styles.globeSkeleton}>
      <div className={styles.globeSkeletonCircle} />
      <div className={styles.globeSkeletonRing} />
      <div className={styles.globeSkeletonRing2} />
    </div>
  ),
})

export function Hero({ stats }: { stats: PublicStats | null }) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {/* Left column */}
        <div className={styles.left}>
          {/* <div className={styles.badge}>
            <span>🤖</span>
            <span>Powered by ElevenLabs AI</span>
          </div> */}

          <h1 className={styles.h1}>
            Your Business,
            <br />
            <span>Always Responding</span>
          </h1>

          <p className={styles.subtitle}>
            Deploy an AI agent that handles WhatsApp conversations 24/7.
            Answer questions, capture leads, and delight customers — automatically.
          </p>

          <div className={styles.ctas}>
            <Link href="/signup" className={styles.ctaPrimary}>
              Get Started Free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="https://youtu.be/tkrXSJWvLv0?si=GD9Op0d3KqDXgAVg" target="_blank" rel="noopener noreferrer" className={styles.ctaSecondary}>
              See How It Works
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>

          <div className={styles.trust}>
            <div className={styles.trustAvatars}>
              {["A", "K", "C", "B", "E"].map((initial) => (
                <div key={initial} className={styles.trustAvatar}>
                  {initial}
                </div>
              ))}
            </div>
            <span>Trusted by 10+ businesses across Nigeria</span>
          </div>
        </div>

        {/* Right column — Globe */}
        <div className={styles.globeContainer}>
          <div className={styles.globeGlow} />
          <Globe />
        </div>
      </div>

      <LiveStats initial={stats} />
    </section>
  )
}

export default Hero
