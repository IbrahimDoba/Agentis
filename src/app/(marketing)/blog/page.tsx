"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import { blogPosts, blogCategories } from "@/data/blog-posts"
import styles from "./page.module.css"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("All")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    let posts = blogPosts
    if (activeCategory !== "All") {
      posts = posts.filter((p) => p.category === activeCategory)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
    }
    return posts
  }, [activeCategory, search])

  const categories = ["All", ...blogCategories]

  return (
    <>
      <Navbar />
      <main className={styles.page}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.badge}>Blog</div>
          <h1 className={styles.heroTitle}>Ideas, insights & stories</h1>
          <p className={styles.heroDesc}>
            Everything you need to know about AI customer service, WhatsApp automation, and growing your Nigerian business.
          </p>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </section>

        {/* Category filters */}
        <div className={styles.filters}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`${styles.filterBtn} ${activeCategory === cat ? styles.filterBtnActive : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <div className={styles.resultsInfo}>
          {filtered.length === blogPosts.length
            ? `${blogPosts.length} articles`
            : `${filtered.length} of ${blogPosts.length} articles`}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔍</div>
            <p>No articles match your search. Try a different keyword or category.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span
                    className={styles.categoryBadge}
                    style={{ "--cat-color": CATEGORY_COLORS[post.category] ?? "var(--accent)" } as React.CSSProperties}
                  >
                    {post.category}
                  </span>
                  <span className={styles.cardDate}>{formatDate(post.publishedAt)}</span>
                </div>
                <h2 className={styles.cardTitle}>{post.title}</h2>
                <p className={styles.cardExcerpt}>{post.excerpt}</p>
                <div className={styles.cardFooter}>
                  <span className={styles.readMore}>
                    Read article
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
