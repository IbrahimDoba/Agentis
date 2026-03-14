"use client"
import dynamic from "next/dynamic"
import Link from "next/link"
import Image from "next/image"
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

export function Hero() {
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
            <Link href="/how-it-works" className={styles.ctaSecondary}>
              See How It Works
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>

          <div className={styles.trust}>
            <div className={styles.trustAvatars}>
              {[10, 20, 30, 40, 50].map((n) => (
                <Image
                  key={n}
                  src={`https://i.pravatar.cc/40?img=${n}`}
                  alt="Business owner"
                  width={32}
                  height={32}
                  className={styles.trustAvatar}
                />
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

      {/* Stat cards */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm.75 11.25h-1.5v-5.5h1.5v5.5zm0-7h-1.5V4.75h1.5v1.5z" fill="#00dc82"/>
            </svg>
          </div>
          <div>
            <div className={styles.statValue}>1,200+</div>
            <div className={styles.statLabel}>Conversations Handled</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="#00dc82" strokeWidth="1.5"/>
              <path d="M10 6v4l2.5 2.5" stroke="#00dc82" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className={styles.statValue}>&lt; 2s</div>
            <div className={styles.statLabel}>Response Time</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l2.09 4.26L17 7.27l-3.5 3.41.83 4.82L10 13.27 5.67 15.5l.83-4.82L3 7.27l4.91-.01L10 2z" fill="#00dc82"/>
            </svg>
          </div>
          <div>
            <div className={styles.statValue}>24/7</div>
            <div className={styles.statLabel}>Uptime Guaranteed</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
