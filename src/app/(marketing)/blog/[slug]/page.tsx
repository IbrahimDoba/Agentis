import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { blogPosts, getBlogPost } from "@/data/blog-posts"
import { getArticleContent, getArticleFaqs } from "@/lib/blog-content"
import { renderMarkdown } from "@/lib/markdown"
import { JsonLd } from "@/components/JsonLd"
import { pageMetadata, articleJsonLd, metaDescription } from "@/lib/seo"
import styles from "./page.module.css"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }))
}

const describe = (post: { metaDescription: string }) => metaDescription(post.metaDescription)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}
  return pageMetadata({
    title: post.title,
    description: describe(post),
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    keywords: [post.primaryKeyword, "WhatsApp AI Nigeria", "Dailzero"],
  })
}

const CATEGORY_COLORS: Record<string, string> = {
  "Fintech / Finance": "#3b82f6",
  "Real Estate": "#8b5cf6",
  "Hotels / Hospitality": "#f59e0b",
  "E-commerce": "#ec4899",
  "Agencies / Freelancers": "#06b6d4",
  "General SMBs": "#00dc82",
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  const content = getArticleContent(post.id)
  if (!content) notFound()
  const rendered = renderMarkdown(content)
  const faqs = getArticleFaqs(content)

  const related = blogPosts
    .filter((p) => p.category === post.category && p.id !== post.id)
    .slice(0, 3)

  return (
    <>
      <JsonLd
        data={articleJsonLd({
          title: post.title,
          description: describe(post),
          slug: post.slug,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          category: post.category,
          faqs,
        })}
      />
      <Navbar />
      <main className={styles.page}>
        {/* Back */}
        <div className={styles.backRow}>
          <Link href="/blog" className={styles.backLink}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 8H3M7 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to blog
          </Link>
        </div>

        {/* Hero */}
        <div className={styles.hero}>
          <div className={styles.meta}>
            <span
              className={styles.categoryBadge}
              style={{ "--cat-color": CATEGORY_COLORS[post.category] ?? "var(--accent)" } as React.CSSProperties}
            >
              {post.category}
            </span>
            <span className={styles.dot}>·</span>
            <span className={styles.date}>
              {post.updatedAt
                ? <>Updated <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time></>
                : <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
            </span>
          </div>
          <h1 className={styles.title}>{post.title}</h1>
        </div>

        {/* Layout */}
        <div className={styles.layout}>
          <article className={styles.article}>
            <div className={styles.prose}>{rendered}</div>

            {/* CTA */}
            <div className={styles.cta}>
              <div className={styles.ctaGlow} />
              <h2 className={styles.ctaTitle}>Ready to automate your WhatsApp?</h2>
              <p className={styles.ctaDesc}>
                Join Nigerian businesses using Dailzero to handle customer inquiries 24/7 — automatically.
              </p>
              <div className={styles.ctaBtns}>
                <Link href="/signup" className={styles.ctaBtnPrimary}>
                  Start Free Trial →
                </Link>
                <Link href="/how-it-works" className={styles.ctaBtnSecondary}>
                  See How It Works
                </Link>
              </div>
            </div>
          </article>

          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.sideCard}>
              <div className={styles.sideTitle}>About Dailzero</div>
              <p className={styles.sideDesc}>
                Dailzero helps Nigerian businesses automate WhatsApp customer service using AI agents — 24/7, no extra staff needed.
              </p>
              <Link href="/signup" className={styles.sideBtn}>
                Start Free Trial →
              </Link>
            </div>

            {related.length > 0 && (
              <div className={styles.sideCard}>
                <div className={styles.sideTitle}>Related Articles</div>
                <div className={styles.relatedList}>
                  {related.map((r) => (
                    <Link key={r.id} href={`/blog/${r.slug}`} className={styles.relatedItem}>
                      <span className={styles.relatedTitle}>{r.title}</span>
                      <span className={styles.relatedDate}>{formatDate(r.publishedAt)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  )
}
