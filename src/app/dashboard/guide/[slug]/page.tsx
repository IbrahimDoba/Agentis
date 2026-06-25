import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import {
  GUIDE_TOPICS,
  getGuideBySlug,
  type GuideTopic,
} from "@/lib/guide-content"
import { getTenantBranding } from "@/lib/tenant"
import styles from "../guide.module.css"
import { renderGuideMarkdown } from "./renderer"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return GUIDE_TOPICS.map((t) => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const branding = await getTenantBranding()
  const topic = getGuideBySlug(slug)
  if (!topic) return { title: `Guide — ${branding.appName}` }
  return {
    title: `${topic.title} — ${branding.appName} Guide`,
    description: topic.intro,
  }
}

export default async function GuideTopicPage({ params }: PageProps) {
  const { slug } = await params
  const branding = await getTenantBranding()
  const brandify = (s: string) =>
    s.replaceAll("D-Zero AI", branding.appName).replaceAll("Dailzero", branding.appName).replaceAll("D-Zero", branding.appName)
  const topic = getGuideBySlug(slug)
  if (!topic) notFound()

  const related = (topic.related ?? [])
    .map((s) => getGuideBySlug(s))
    .filter((t): t is GuideTopic => Boolean(t))

  return (
    <div className={styles.detail}>
      <Link href="/dashboard/guide" className={styles.back}>
        <ArrowLeftIcon width={14} height={14} /> Back to all guides
      </Link>

      <header className={styles.detailHeader}>
        <div className={styles.detailEmoji}>{topic.emoji}</div>
        <h1 className={styles.detailTitle}>{brandify(topic.title)}</h1>
        <p className={styles.detailIntro}>{brandify(topic.intro)}</p>
      </header>

      <article className={styles.body}>
        {renderGuideMarkdown(brandify(topic.body))}
      </article>

      {related.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>Related</h2>
          <div className={styles.relatedGrid}>
            {related.map((t) => (
              <Link
                key={t.slug}
                href={`/dashboard/guide/${t.slug}`}
                className={styles.relatedCard}
              >
                <span className={styles.relatedEmoji}>{t.emoji}</span>
                <span className={styles.relatedTitleText}>{brandify(t.title)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
