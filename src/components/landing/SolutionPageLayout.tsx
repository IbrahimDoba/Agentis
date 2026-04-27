import Link from "next/link"
import Image from "next/image"
import { Fragment } from "react"
import { ArrowRightIcon, CheckIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline"
import type { ComponentType } from "react"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./SolutionPageLayout.module.css"

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  from: "customer" | "ai"
  text: string
  badge?: string
}

export interface Benefit {
  Icon: ComponentType<{ width?: number; height?: number; className?: string }>
  title: string
  desc: string
}

export interface Stat {
  val: string
  label: string
}

export interface FloatingBadge {
  text: string
  dot?: boolean
  Icon?: ComponentType<{ width?: number; height?: number }>
}

export interface PainPoint {
  title: string
  desc: string
}

export interface Step {
  number: string
  title: string
  desc: string
}

export interface ShowcaseImage {
  src: string
  alt: string
  badge: string
  BadgeIcon?: ComponentType<{ width?: number; height?: number }>
}

export interface SolutionPageLayoutProps {
  // SEO
  slug: string

  // Hero
  BadgeIcon: ComponentType<{ width?: number; height?: number }>
  badge: string
  heroImage: string
  heroImageAlt: string
  heroTitle: React.ReactNode
  heroSub: string
  floatingBadges?: [FloatingBadge, FloatingBadge, FloatingBadge]

  // Stats
  stats: [Stat, Stat, Stat]

  // Chat section
  chatBotName: string
  chatTitle: React.ReactNode
  chatDesc: string
  chatPoints: string[]
  conversation: ConversationMessage[]

  // Pain points
  painTitle?: string
  painPoints: PainPoint[]

  // Benefits
  benefitsTitle: string
  benefits: Benefit[]

  // How it works
  stepsTitle?: string
  steps: Step[]

  // Showcase
  showcaseImages: [ShowcaseImage, ShowcaseImage]
  showcaseQuote: string

  // CTA
  ctaTitle: string
  ctaDesc: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SolutionPageLayout({
  slug,
  BadgeIcon,
  badge,
  heroImage,
  heroImageAlt,
  heroTitle,
  heroSub,
  floatingBadges,
  stats,
  chatBotName,
  chatTitle,
  chatDesc,
  chatPoints,
  conversation,
  painTitle = "Sound familiar?",
  painPoints,
  benefitsTitle,
  benefits,
  stepsTitle = "How it works",
  steps,
  showcaseImages,
  showcaseQuote,
  ctaTitle,
  ctaDesc,
}: SolutionPageLayoutProps) {
  const [fb1, fb2, fb3] = floatingBadges ?? [
    { text: "Response < 1s", dot: true },
    { text: "Lead Captured", Icon: CheckIcon },
    { text: "24/7 Active", dot: true },
  ]

  const pageUrl = `https://dailzero.com/solutions/${slug}`

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: `D-Zero AI for ${badge}`,
        description: heroSub,
        provider: {
          "@type": "Organization",
          name: "D-Zero AI",
          url: "https://dailzero.com",
        },
        serviceType: "AI WhatsApp Automation",
        url: pageUrl,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://dailzero.com" },
          { "@type": "ListItem", position: 2, name: "Solutions", item: "https://dailzero.com/solutions" },
          { "@type": "ListItem", position: 3, name: badge, item: pageUrl },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: painPoints.map((p) => ({
          "@type": "Question",
          name: p.title,
          acceptedAnswer: {
            "@type": "Answer",
            text: p.desc,
          },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main className={styles.main}>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <Image
            src={heroImage}
            alt={heroImageAlt}
            fill
            priority
            className={styles.heroBg}
            sizes="100vw"
          />
          <div className={styles.heroOverlay} />

          <div className={`${styles.floatingBadge} ${styles.fb1}`}>
            {fb1.dot ? <span className={styles.floatingDot} /> : fb1.Icon ? <fb1.Icon width={12} height={12} /> : null}
            {fb1.text}
          </div>
          <div className={`${styles.floatingBadge} ${styles.fb2}`}>
            {fb2.dot ? <span className={styles.floatingDot} /> : fb2.Icon ? <fb2.Icon width={12} height={12} /> : null}
            {fb2.text}
          </div>
          <div className={`${styles.floatingBadge} ${styles.fb3}`}>
            {fb3.dot ? <span className={styles.floatingDot} /> : fb3.Icon ? <fb3.Icon width={12} height={12} /> : null}
            {fb3.text}
          </div>

          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <BadgeIcon width={14} height={14} />
              {badge}
            </div>
            <h1 className={styles.heroTitle}>{heroTitle}</h1>
            <p className={styles.heroSub}>{heroSub}</p>
            <div className={styles.heroCtas}>
              <Link href="/signup" className={styles.btnPrimary}>
                Get Started Free
                <ArrowRightIcon width={16} height={16} />
              </Link>
              <Link href="https://youtu.be/tkrXSJWvLv0?si=GD9Op0d3KqDXgAVg" target="_blank" rel="noopener noreferrer" className={styles.btnGhost}>
                See how it works
              </Link>
            </div>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <div className={styles.statsStrip}>
          {stats.map((s, i) => (
            <Fragment key={s.label}>
              <div className={styles.statItem}>
                <span className={styles.statVal}>{s.val}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
              {i < 2 && <div className={styles.statDivider} />}
            </Fragment>
          ))}
        </div>

        {/* ── Chat mockup + pitch ── */}
        <section className={styles.chatSection}>
          <div className={styles.chatInner}>
            <div className={styles.phoneWrap}>
              <div className={styles.phone}>
                <div className={styles.phoneHeader}>
                  <div className={styles.phoneAvatar}>{chatBotName[0]}</div>
                  <div>
                    <div className={styles.phoneName}>{chatBotName}</div>
                    <div className={styles.phoneStatus}>
                      <span className={styles.phoneDot} />
                      Online
                    </div>
                  </div>
                </div>
                <div className={styles.phoneMessages}>
                  {conversation.map((msg, i) => (
                    <div
                      key={i}
                      className={`${styles.msg} ${msg.from === "customer" ? styles.msgOut : styles.msgIn}`}
                    >
                      <div className={styles.msgBubble}>{msg.text}</div>
                      {msg.badge && (
                        <div className={styles.leadBadge}>
                          <CheckIcon width={10} height={10} />
                          {msg.badge}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className={styles.phoneInputBar}>
                  <span className={styles.phoneInputText}>Type a message…</span>
                </div>
              </div>
            </div>

            <div className={styles.chatCopy}>
              <div className={styles.sectionLabel}>See it in action</div>
              <h2 className={styles.sectionTitle}>{chatTitle}</h2>
              <p className={styles.chatDesc}>{chatDesc}</p>
              <ul className={styles.checkList}>
                {chatPoints.map((pt) => (
                  <li key={pt}>
                    <CheckIcon width={16} height={16} />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={styles.btnPrimary}>
                Try it free
                <ArrowRightIcon width={16} height={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Pain points ── */}
        <section className={styles.painSection}>
          <div className={styles.sectionInner}>
            <div className={styles.painHeader}>
              <div className={styles.sectionLabel}>The Challenge</div>
              <h2 className={styles.sectionTitle}>{painTitle}</h2>
              <p className={styles.painSubtitle}>
                These are the problems your competitors haven&apos;t solved yet. D-Zero AI handles all of them.
              </p>
            </div>
            <div className={styles.painGrid}>
              {painPoints.map((p) => (
                <div key={p.title} className={styles.painCard}>
                  <div className={styles.painIconWrap}>
                    <ExclamationCircleIcon width={20} height={20} />
                  </div>
                  <div>
                    <div className={styles.painTitle}>{p.title}</div>
                    <div className={styles.painDesc}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Benefits ── */}
        <section className={styles.benefitsSection}>
          <div className={styles.sectionInner}>
            <div className={styles.benefitsHeader}>
              <div className={styles.sectionLabel}>Key Benefits</div>
              <h2 className={styles.sectionTitle}>{benefitsTitle}</h2>
            </div>
            <div className={styles.benefitsGrid}>
              {benefits.map((b) => (
                <div key={b.title} className={styles.benefitCard}>
                  <div className={styles.benefitIconWrap}>
                    <b.Icon width={22} height={22} />
                  </div>
                  <h3 className={styles.benefitTitle}>{b.title}</h3>
                  <p className={styles.benefitDesc}>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className={styles.stepsSection}>
          <div className={styles.sectionInner}>
            <div className={styles.stepsHeader}>
              <div className={styles.sectionLabel}>Setup</div>
              <h2 className={styles.sectionTitle}>{stepsTitle}</h2>
            </div>
            <div className={styles.stepsGrid}>
              {steps.map((step, i) => (
                <div key={step.number} className={styles.stepCard}>
                  <div className={styles.stepNumber}>{step.number}</div>
                  {i < steps.length - 1 && <div className={styles.stepConnector} />}
                  <div className={styles.stepContent}>
                    <div className={styles.stepTitle}>{step.title}</div>
                    <div className={styles.stepDesc}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Visual showcase ── */}
        <section className={styles.showcase}>
          <div className={styles.showcaseInner}>
            {showcaseImages.map(({ src, alt, badge, BadgeIcon: BIcon }) => (
              <div key={src} className={styles.showcaseImgWrap}>
                <Image src={src} alt={alt} fill className={styles.showcaseImg} sizes="(max-width: 768px) 100vw, 50vw" />
                <div className={styles.showcaseOverlay}>
                  <div className={styles.showcaseBadge}>
                    {BIcon ? <BIcon width={11} height={11} /> : <span className={styles.floatingDot} />}
                    {badge}
                  </div>
                </div>
              </div>
            ))}
            <div className={styles.showcaseText}>
              <div className={styles.sectionLabel}>What customers say</div>
              <p className={styles.showcaseQuote}>&ldquo;{showcaseQuote}&rdquo;</p>
              <div className={styles.showcaseAuthor}>
                <div className={styles.showcaseAuthorDot} />
                <span>D-Zero AI customer</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaGlow} />
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>{ctaTitle}</h2>
            <p className={styles.ctaDesc}>{ctaDesc}</p>
            <div className={styles.ctaButtons}>
              <Link href="/signup" className={styles.btnPrimary}>
                Get Started Free
              </Link>
              <Link href="/contact" className={styles.btnOutline}>
                Book a Demo
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
