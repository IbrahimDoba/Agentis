import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Script from "next/script"
import { db } from "@/lib/db"
import styles from "./page.module.css"

// The mirror demo. A prospect lands here from a cold email and talks to an AI
// agent already loaded with their own business information.
//
// The page has one job and deliberately carries no nav, no pricing table and no
// signup form above the fold: anything that reads as a funnel undermines the
// only claim being made, which is that we built them something before asking
// for anything.

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

async function loadDemo(slug: string) {
  const prospect = await db.outreachProspect.findUnique({
    where: { demoSlug: slug },
    select: {
      businessName: true,
      demoAgentId: true,
      demoExpiresAt: true,
    },
  })
  if (!prospect?.demoAgentId) return null

  const site = await db.embedSite.findUnique({
    where: { agentId: prospect.demoAgentId },
    select: { publicKey: true, isActive: true },
  })
  if (!site) return null

  const expired = !site.isActive || (prospect.demoExpiresAt !== null && prospect.demoExpiresAt < new Date())
  return { businessName: prospect.businessName, publicKey: site.publicKey, expired }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const demo = await loadDemo(slug)
  return {
    title: demo ? `AI agent for ${demo.businessName}` : "Demo",
    // These URLs are handed to one business and nobody else. Keeping them out
    // of search results is the difference between a private demo and a public
    // page about someone's company that they never asked for.
    robots: { index: false, follow: false },
  }
}

export default async function DemoPage({ params }: Props) {
  const { slug } = await params
  const demo = await loadDemo(slug)
  if (!demo) notFound()

  if (demo.expired) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Dailzero</p>
          <h1 className={styles.title}>This demo has closed</h1>
          <p className={styles.lede}>
            The agent we built for {demo.businessName} is no longer running. If you would still
            like to see it, reply to the email and we will switch it back on.
          </p>
          <a className={styles.cta} href="https://www.dailzero.com/signup?utm_source=outreach&utm_medium=demo&utm_campaign=cold-pilot">
            Build your own instead
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Dailzero</p>
        <h1 className={styles.title}>
          This is a live AI agent for <span className={styles.business}>{demo.businessName}</span>
        </h1>
        <p className={styles.lede}>
          We built it using only what is already public about your business. Ask it something one
          of your customers would ask. It answers on WhatsApp exactly the same way.
        </p>
        <p className={styles.hint}>Tap the chat bubble in the corner to start.</p>

        <div className={styles.footer}>
          <a
            className={styles.cta}
            href="https://www.dailzero.com/signup?utm_source=outreach&utm_medium=demo&utm_campaign=cold-pilot"
          >
            Put this on your own WhatsApp number
          </a>
          <p className={styles.finePrint}>
            7-day free trial, no card needed. Your trial only starts once you connect WhatsApp.
          </p>
        </div>
      </div>

      <Script id="dz-embed-boot" strategy="afterInteractive">
        {`window.dz = window.dz || function(){(window.dz.q=window.dz.q||[]).push(arguments)};
dz('init', { publicKey: ${JSON.stringify(demo.publicKey)} });`}
      </Script>
      <Script src="/embed/v1.js" strategy="afterInteractive" />
    </main>
  )
}
