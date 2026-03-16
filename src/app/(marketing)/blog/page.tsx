import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata = {
  title: "Blog — D-Zero AI",
  description: "Insights on AI customer service, WhatsApp automation, and growing your business in Africa.",
}

export default function BlogPage() {
  return (
    <>
      <Navbar />
      <main className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.badge}>Blog</div>
          <h1 className={styles.heroTitle}>Ideas, insights & stories</h1>
          <p className={styles.heroDesc}>
            Everything you need to know about AI customer service, WhatsApp automation, and growing your business.
          </p>
        </div>

        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>✍️</div>
          <h2 className={styles.emptyTitle}>No posts yet</h2>
          <p className={styles.emptyDesc}>
            We&apos;re working on our first articles. Follow us to get notified when we publish.
          </p>
          <div className={styles.followLinks}>
            <a href="https://x.com/DobaIbrahim" target="_blank" rel="noopener noreferrer" className={styles.followLink}>
              𝕏 Follow on X
            </a>
            <a href="https://www.linkedin.com/in/ibrahimdoba/" target="_blank" rel="noopener noreferrer" className={styles.followLink}>
              LinkedIn
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
