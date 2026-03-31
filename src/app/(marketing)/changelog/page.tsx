import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

const updates = [
  {
    date: "March 2026",
    tag: "New",
    tagColor: "green",
    title: "AI Lead Detection & Leads Dashboard",
    description:
      "Every completed conversation is now automatically scanned by AI. High-intent chats — customers asking about pricing, placing orders, or requesting a callback — are instantly flagged as leads.",
    bullets: [
      "AI scans every conversation for buying intent automatically",
      "Dedicated Leads page with New → Contacted → Closed pipeline",
      "Manually flag any conversation as a lead from the chat view",
      "Add private notes and track follow-up status per lead",
      "Click any lead to read the full conversation transcript",
    ],
  },
  {
    date: "March 2026",
    tag: "New",
    tagColor: "green",
    title: "Live API Tools",
    description:
      "Your agent can now connect to your website's backend to fetch real-time data during conversations. Order status, product availability, delivery tracking — all answered live.",
    bullets: [
      "Connect any REST API endpoint (GET or POST)",
      "Fully configurable request parameters",
      "Agent decides intelligently when to call each tool",
      "Multiple tools per agent supported",
    ],
  },
  {
    date: "March 2026",
    tag: "New",
    tagColor: "green",
    title: "Knowledge Base",
    description:
      "Upload your documents, PDFs, or website URLs and your agent learns from them instantly. Customers get accurate answers pulled directly from your own content.",
    bullets: [
      "Upload PDFs, Word documents, and text files",
      "Add any webpage URL as a knowledge source",
      "Agent answers from your exact uploaded content",
      "Update or remove documents anytime",
    ],
  },
  {
    date: "March 2026",
    tag: "New",
    tagColor: "green",
    title: "Multiple AI Agents",
    description:
      "Run separate AI agents for different brands, departments, or WhatsApp numbers — each with its own personality, knowledge base, tools, and configuration.",
    bullets: [
      "Create and manage multiple agents from one dashboard",
      "Each agent is fully independent",
      "Switch between agents on the conversations page",
      "Admin controls agent limits per account",
    ],
  },
  {
    date: "March 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Read / Unread Conversations",
    description:
      "Conversations you haven't opened yet are clearly marked so you always know what's new. Opening a conversation marks it as read — state persists across sessions.",
    bullets: [
      "Green left border and dot on unread conversations",
      "Instantly clears when you open the conversation",
      "Persists across page reloads and devices",
    ],
  },
  {
    date: "March 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Agent Profile & Business Details",
    description:
      "Each agent now has a dedicated profile with a photo, category, business address, and contact details — all shown on your WhatsApp Business profile.",
    bullets: [
      "Profile picture upload via Cloudinary",
      "Business category, address, website, and contact info",
      "Information syncs to your WhatsApp Business profile",
    ],
  },
  {
    date: "February 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Product Catalogue",
    description:
      "Add your products directly to your agent configuration. The agent knows your full catalogue and can answer questions about products, prices, and availability.",
    bullets: [
      "Add product name, price, description, and photo",
      "Agent references products in real conversations",
      "Inline add and edit from the dashboard",
    ],
  },
  {
    date: "February 2026",
    tag: "New",
    tagColor: "green",
    title: "Agent Auto-Sync",
    description:
      "Every time you update your agent's configuration, the changes are automatically pushed to your live WhatsApp agent — no manual steps required.",
    bullets: [
      "System prompt generated and synced on every save",
      "Knowledge base and tools sync in real time",
      "Zero downtime updates",
    ],
  },
  {
    date: "January 2026",
    tag: "New",
    tagColor: "green",
    title: "Conversation Dashboard",
    description:
      "A full conversation history view with transcripts, AI-generated summaries, call duration, and status — all in one place.",
    bullets: [
      "Full transcript with chat bubble view",
      "AI-generated conversation summary",
      "Duration, message count, and resolution status",
      "Audio recording playback where available",
    ],
  },
]

const tagStyles: Record<string, string> = {
  green: styles.tagGreen,
  blue: styles.tagBlue,
  orange: styles.tagOrange,
}

export default function ChangelogPage() {
  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>Changelog</div>
            <h1 className={styles.heroTitle}>
              What&apos;s new in <span>D-Zero AI</span>
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
                  <h2 className={styles.entryTitle}>{update.title}</h2>
                  <p className={styles.entryDesc}>{update.description}</p>
                  <ul className={styles.entryBullets}>
                    {update.bullets.map((b, j) => (
                      <li key={j} className={styles.entryBullet}>
                        <span className={styles.bulletCheck}>✓</span>
                        {b}
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
