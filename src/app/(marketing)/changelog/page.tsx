import type { Metadata } from "next"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "Changelog — D-Zero AI",
  description:
    "Every update, improvement, and new feature shipped to D-Zero AI — documented as we build the future of WhatsApp AI agents for business.",
  openGraph: {
    title: "Changelog — D-Zero AI",
    description:
      "Every update, improvement, and new feature shipped to D-Zero AI — documented as we build the future of WhatsApp AI agents for business.",
    url: "https://dailzero.com/changelog",
    siteName: "D-Zero AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Changelog — D-Zero AI",
    description:
      "Every update, improvement, and new feature shipped to D-Zero AI — documented as we build the future of WhatsApp AI agents for business.",
  },
}

const updates = [
  {
    date: "15 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Subscription Plans & Upgrade Requests",
    description:
      "Users can now browse all available plans and submit an upgrade request directly from their dashboard. Requests are reviewed and approved manually by admins — no payment provider integration required yet.",
    bullets: [
      "New /dashboard/subscription page with side-by-side plan comparison cards",
      "Free, Starter, Pro, and Enterprise plans with full feature breakdowns",
      "Upgrade button generates a unique reference number and bank transfer instructions",
      "Pending request banner shown until admin approves the upgrade",
      "Only one active request at a time — submitting a new one cancels the previous",
      "Enterprise plan shows a Contact Sales link",
    ],
  },
  {
    date: "15 April 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Sidebar Usage Widget",
    description:
      "The dashboard sidebar now shows a compact credit usage widget so you always know how much of your monthly allowance you've used without leaving the page.",
    bullets: [
      "Shows your current plan and credit usage percentage",
      "Progress bar turns amber at 75% and red at 90%",
      "Displays credits used and credits remaining",
      "Clicking the widget takes you to the Billing page",
    ],
  },
  {
    date: "15 April 2026",
    tag: "Fix",
    tagColor: "orange",
    title: "Conversations Ordered by Actual Call Time",
    description:
      "The conversations list was showing older chats at the top due to a sort bug where synced conversations were ordered by the time they were imported rather than when the call actually happened.",
    bullets: [
      "Conversations now always sort by actual call start time, newest first",
      "In-progress calls appear at the top of the list",
      "Synced conversations no longer jump to the top when the page loads",
      "All existing conversations backfilled with correct timestamps",
    ],
  },
  {
    date: "15 April 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Customer Memory Improvements",
    description:
      "The AI agent now remembers returning customers more reliably — recognising them by name and building a richer picture of past interactions over time.",
    bullets: [
      "Agent learns and remembers the customer's first name from conversation",
      "Returning customers are greeted by name on every call",
      "Memory context includes name, topics discussed, and unresolved items",
      "Fixed a bug where some returning customers were incorrectly treated as new",
    ],
  },
  {
    date: "9 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Referral Program",
    description:
      "Users can now opt into the referral program from their profile and earn 15% commission on every paying customer they refer. Admins can track, manage, and pay out commissions from a dedicated referral panel.",
    bullets: [
      "Enable referrals via a toggle in your Profile — the Referrals tab only appears once you opt in",
      "Unique referral link generated per user (e.g. /signup?ref=john-k7x2mq)",
      "Referral is automatically recorded when a new user signs up through your link",
      "15% commission: Starter ₦7,500 · Pro ₦12,750 · Enterprise custom",
      "Commission auto-calculates when admin sets a referred user to a paid plan",
      "Admin can manually assign a referral if the user didn't use the link",
      "Admin can set custom commission amounts for Enterprise referrals",
      "Admin marks referrals as Paid Out once commission is sent",
      "Dashboard shows Total Referrals, Total Earned, Pending, and Paid Out stats",
    ],
  },
  {
    date: "8 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Newsletter System",
    description:
      "Admins can now compose and send branded email newsletters directly from the admin panel, and visitors can subscribe from the website footer.",
    bullets: [
      "Newsletter subscribe form in the marketing footer",
      "Admin composer with template quick-fills: Announcement, Feature Update, Tip & Insight, General",
      "Live email preview before sending",
      "Send to newsletter subscribers, active users, or both",
      "Batch sending via Resend — handles large lists reliably",
      "Branded dark email design consistent with the D-Zero AI identity",
    ],
  },
  {
    date: "9 April 2026",
    tag: "New",
    tagColor: "green",
    title: "User Onboarding Flow",
    description:
      "New users now go through a guided 5-step onboarding experience after their account is approved, helping them set up their business profile and understand the platform before creating their first agent.",
    bullets: [
      "5-step flow: Welcome → Business Profile → Primary Goal → Platform Tour → Done",
      "Collects business category and description to personalise the experience",
      "Platform tour explains Chats, Leads, Contacts, and Agents",
      "Ends with a direct CTA to create your first agent",
      "Existing users with agents skip onboarding automatically",
    ],
  },
  {
    date: "8 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Agent Templates",
    description:
      "Creating a new agent now starts with a template picker — choose from Receptionist, Sales Agent, Support Agent, or start from scratch. Each template pre-fills the system prompt so you're set up in seconds.",
    bullets: [
      "4 template cards shown when creating a new agent",
      "Receptionist, Sales Agent, and Support Agent templates with pre-written system prompts",
      "From Scratch option for full customisation",
      "Two-tab form: Profile and Configuration — switch back to pick a different template at any time",
    ],
  },
  {
    date: "8 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Test Agent — Live Testing",
    description:
      "Active agents now have a Test Agent button that lets you speak to your agent live directly from the dashboard, using the ElevenLabs embedded widget.",
    bullets: [
      "Test Agent button shown when agent status is Active",
      "Opens a modal with the ElevenLabs ConvAI widget",
      "Microphone access prompted in-browser — no external tools needed",
      "Widget script loads lazily on first open",
    ],
  },
  {
    date: "7 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Contacts View — Full History & Export",
    description:
      "The Contacts tab now shows every unique caller across all conversations, not just the first page. Browse all contacts with scroll pagination, search by number, and export your full contact list to Excel.",
    bullets: [
      "All unique contacts loaded directly from the database — no page limit",
      "Scroll pagination loads 30 contacts at a time",
      "Search contacts by phone number in real time",
      "Export to a structured Excel file with chat count, talk time, first/last contact dates, and latest summary",
      "Click any contact to view their full conversation history with transcripts",
      "Summaries truncated by default — click to expand",
    ],
  },
  {
    date: "7 April 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Live Conversations & Faster Phone Resolution",
    description:
      "Active calls now appear on the dashboard the moment they start, and phone numbers resolve immediately without needing to open the conversation.",
    bullets: [
      "In-progress calls saved to the database as soon as a conversation begins",
      "Conversations list refreshes automatically every 20 seconds",
      "Phone numbers patched in the background during sync — no click required",
      "Conversation list no longer flashes empty when switching tabs",
    ],
  },
  {
    date: "7 April 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Simplified Agent Configuration",
    description:
      "The agent config tab has been streamlined. Instead of multiple separate fields, you now write one System Prompt that goes directly to your AI agent, plus a product catalogue.",
    bullets: [
      "System Prompt fetched live from your connected ElevenLabs agent",
      "Refresh button to reload the latest prompt at any time",
      "Products remain as a separate structured section",
      "Fewer fields — faster setup",
    ],
  },
  {
    date: "5 April 2026",
    tag: "Fix",
    tagColor: "orange",
    title: "Password Reset Now Properly Unlocks Login",
    description:
      "Users who reset their password were still unable to log in due to a bug where email verification status was not correctly updated. This is now fixed.",
    bullets: [
      "Resetting password now marks email as verified",
      "Affected users can log in immediately after resetting",
    ],
  },
  {
    date: "4 April 2026",
    tag: "New",
    tagColor: "green",
    title: "Media in Conversation Transcripts",
    description:
      "Voice notes, images, videos, and documents shared during WhatsApp conversations are now visible directly inside the conversation view.",
    bullets: [
      "Voice notes shown with a mic indicator and audio player",
      "Images displayed inline with click-to-expand lightbox",
      "Video and document attachments rendered with download links",
      "Works in both the conversation drawer and the agent detail view",
    ],
  },
  {
    date: "4 April 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Conversations Served from Local DB with Live Sync",
    description:
      "The conversations list now loads from your local database for instant pagination, while staying in sync with ElevenLabs in the background.",
    bullets: [
      "Infinite scroll with 20 conversations per page",
      "First page load syncs latest conversations from ElevenLabs automatically",
      "In-progress conversations update to completed status on refresh",
      "Phone numbers backfilled for all existing conversations",
    ],
  },
  {
    date: "4 April 2026",
    tag: "Improvement",
    tagColor: "blue",
    title: "Dashboard Stats — Contacts & Leads Rate",
    description:
      "The overview dashboard now shows Total Contacts and Leads Rate alongside total conversations and leads, giving a clearer picture of agent performance.",
    bullets: [
      "Total Contacts shows unique callers reached",
      "Leads Rate shows what percentage of conversations become leads",
      "Each stat card has a descriptive icon",
      "Leads card links directly to the Leads page",
    ],
  },
  {
    date: "28 March 2026",
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
    date: "25 March 2026",
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
    date: "22 March 2026",
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
    date: "19 March 2026",
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
    date: "16 March 2026",
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
    date: "14 March 2026",
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
    date: "28 February 2026",
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
    date: "15 February 2026",
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
    date: "30 January 2026",
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
