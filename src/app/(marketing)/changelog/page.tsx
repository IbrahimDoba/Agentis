import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { getTenantBranding, brandingIcons, brandText } from "@/lib/tenant"
import updates from "./updates.json"
import styles from "./page.module.css"

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getTenantBranding()
  const { appName, isPlatform } = branding
  const description = `Every update, improvement, and new feature shipped to ${appName} — documented as we build the future of WhatsApp AI agents for business.`
  return {
    title: `Changelog — ${appName}`,
    description,
    icons: brandingIcons(branding),
    openGraph: {
      title: `Changelog — ${appName}`,
      description,
      url: isPlatform ? "https://dailzero.com/changelog" : undefined,
      siteName: appName,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Changelog — ${appName}`,
      description,
    },
  }
}

const tagStyles: Record<string, string> = {
  green: styles.tagGreen,
  blue: styles.tagBlue,
  orange: styles.tagOrange,
}

export default async function ChangelogPage() {
  const branding = await getTenantBranding()

  // The changelog is the Dailzero platform's "What's New". Reseller tenants
  // don't get it — bounce them back to their dashboard.
  if (!branding.isPlatform) redirect("/dashboard")

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>Changelog</div>
            <h1 className={styles.heroTitle}>
              What&apos;s new in <span>{branding.appName}</span>
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
                  <h2 className={styles.entryTitle}>{brandText(update.title, branding)}</h2>
                  <p className={styles.entryDesc}>{brandText(update.description, branding)}</p>
                  <ul className={styles.entryBullets}>
                    {update.bullets.map((b, j) => (
                      <li key={j} className={styles.entryBullet}>
                        <span className={styles.bulletCheck}>✓</span>
                        {brandText(b, branding)}
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
