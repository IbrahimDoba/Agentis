import Link from "next/link"
import { Navbar } from "@/components/landing/Navbar"
import { Footer } from "@/components/landing/Footer"
import styles from "./page.module.css"

function ChatIllustration() {
  return (
    <div className={styles.illus}>
      <div className={styles.illusChat}>
        <div className={styles.illusBubbleUser}>Do you deliver to Port Harcourt?</div>
        <div className={styles.illusBubbleAgent}>Yes! We deliver nationwide. PH delivery takes 2–3 days and costs ₦1,500. Want to place an order? 😊</div>
        <div className={styles.illusBubbleUser}>Yes please</div>
        <div className={styles.illusBubbleAgent}>Great! Please share your address and I'll set it up right away.</div>
      </div>
      <div className={styles.illusLabel}>
        <span className={styles.illusDot} />
        Responding in 1.2s
      </div>
    </div>
  )
}

function FAQIllustration() {
  const faqs = [
    { q: "What are your hours?", a: "8am – 10pm daily" },
    { q: "Do you accept transfers?", a: "Yes, all major banks" },
    { q: "Can I return items?", a: "Within 7 days" },
  ]
  return (
    <div className={styles.illus}>
      <div className={styles.illusFaq}>
        {faqs.map((faq, i) => (
          <div key={i} className={styles.illusFaqItem}>
            <div className={styles.illusFaqQ}>{faq.q}</div>
            <div className={styles.illusFaqA}>{faq.a}</div>
          </div>
        ))}
        <div className={styles.illusFaqAdd}>+ Add another FAQ</div>
      </div>
    </div>
  )
}

function LeadIllustration() {
  return (
    <div className={styles.illus}>
      <div className={styles.illusLead}>
        <div className={styles.illusLeadHeader}>
          <span>New Lead Captured</span>
          <span className={styles.illusLeadBadge}>Just now</span>
        </div>
        <div className={styles.illusLeadFields}>
          <div className={styles.illusLeadField}>
            <span className={styles.illusLeadKey}>Name</span>
            <span className={styles.illusLeadVal}>Amaka Eze</span>
          </div>
          <div className={styles.illusLeadField}>
            <span className={styles.illusLeadKey}>Phone</span>
            <span className={styles.illusLeadVal}>+234 803 456 7890</span>
          </div>
          <div className={styles.illusLeadField}>
            <span className={styles.illusLeadKey}>Interest</span>
            <span className={styles.illusLeadVal}>3-bedroom apartment</span>
          </div>
          <div className={styles.illusLeadField}>
            <span className={styles.illusLeadKey}>Budget</span>
            <span className={styles.illusLeadVal}>₦15M – ₦20M</span>
          </div>
        </div>
        <div className={styles.illusLeadActions}>
          <div className={styles.illusLeadBtn}>Follow up scheduled →</div>
        </div>
      </div>
    </div>
  )
}

function VoiceIllustration() {
  return (
    <div className={styles.illus}>
      <div className={styles.illusVoice}>
        <div className={styles.illusVoiceIcon}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M16 4C13.8 4 12 5.8 12 8v8c0 2.2 1.8 4 4 4s4-1.8 4-4V8c0-2.2-1.8-4-4-4z" fill="#00dc82"/>
            <path d="M8 18c0 4.4 3.6 8 8 8s8-3.6 8-8" stroke="#00dc82" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 26v4" stroke="#00dc82" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div className={styles.illusVoiceWave}>
          {[3, 6, 9, 5, 8, 4, 7, 6, 9, 5, 7, 4, 8, 6, 3].map((h, i) => (
            <div key={i} className={styles.illusVoiceBar} style={{ height: `${h * 3}px` }} />
          ))}
        </div>
        <div className={styles.illusVoiceLabel}>AI Voice Agent Active</div>
        <div className={styles.illusVoiceTimer}>0:42</div>
      </div>
    </div>
  )
}

function MediaIllustration() {
  return (
    <div className={styles.illus}>
      <div className={styles.illusMedia}>
        <div className={styles.illusMediaMsg}>
          <div className={styles.illusMediaBubble}>
            Here's our catalogue 📄
            <div className={styles.illusMediaFile}>
              <div className={styles.illusMediaFileIcon}>📎</div>
              <div>
                <div className={styles.illusMediaFileName}>Catalogue_2025.pdf</div>
                <div className={styles.illusMediaFileSize}>2.4 MB</div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.illusMediaMsg}>
          <div className={styles.illusMediaBubble}>
            And a product photo:
            <div className={styles.illusMediaImage} />
          </div>
        </div>
      </div>
    </div>
  )
}

function KnowledgeBaseIllustration() {
  const docs = [
    { icon: "📄", name: "Product Catalogue 2025.pdf", size: "2.4 MB" },
    { icon: "🌐", name: "yourstore.com/faqs", size: "URL" },
    { icon: "📄", name: "Return Policy.pdf", size: "340 KB" },
  ]
  return (
    <div className={styles.illus}>
      <div className={styles.illusKb}>
        <div className={styles.illusKbHeader}>
          <span className={styles.illusKbTitle}>Knowledge Base</span>
          <span className={styles.illusKbCount}>3 documents</span>
        </div>
        {docs.map((doc, i) => (
          <div key={i} className={styles.illusKbDoc}>
            <span className={styles.illusKbDocIcon}>{doc.icon}</span>
            <span className={styles.illusKbDocName}>{doc.name}</span>
            <span className={styles.illusKbDocSize}>{doc.size}</span>
          </div>
        ))}
        <div className={styles.illusKbAdd}>+ Upload document or URL</div>
      </div>
    </div>
  )
}

function ToolsIllustration() {
  return (
    <div className={styles.illus}>
      <div className={styles.illusTools}>
        <div className={styles.illusToolsChat}>
          <div className={styles.illusToolsMsg}>What's the status of order #1042?</div>
          <div className={styles.illusToolsThinking}>
            <span className={styles.illusToolsSpinner} />
            Checking order system…
          </div>
          <div className={styles.illusToolsReply}>
            Order #1042 is out for delivery! Expected by 4pm today. 🚚
          </div>
        </div>
        <div className={styles.illusToolsEndpoint}>
          <span className={styles.illusToolsBadge}>GET</span>
          <span className={styles.illusToolsUrl}>yourstore.com/api/orders</span>
        </div>
      </div>
    </div>
  )
}

function MultiAgentIllustration() {
  const agents = [
    { name: "JustFits Store", status: "Active", color: "#00dc82" },
    { name: "JustFits Support", status: "Active", color: "#00dc82" },
    { name: "JustFits Sales", status: "Setting up", color: "#f59e0b" },
  ]
  return (
    <div className={styles.illus}>
      <div className={styles.illusAgents}>
        {agents.map((a, i) => (
          <div key={i} className={styles.illusAgentRow}>
            <div className={styles.illusAgentAvatar}>{a.name[0]}</div>
            <div className={styles.illusAgentInfo}>
              <div className={styles.illusAgentName}>{a.name}</div>
              <div className={styles.illusAgentStatus}>
                <span className={styles.illusAgentDot} style={{ background: a.color }} />
                {a.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AiLeadIllustration() {
  return (
    <div className={styles.illus}>
      <div className={styles.illusAiLead}>
        <div className={styles.illusAiLeadCard}>
          <div className={styles.illusAiLeadTop}>
            <span className={styles.illusAiLeadCaller}>+234 803 456 7890</span>
            <span className={styles.illusAiLeadBadge}>✨ AI detected</span>
          </div>
          <p className={styles.illusAiLeadSummary}>
            Customer asked about pricing for bulk order of 50 units and requested a callback.
          </p>
          <div className={styles.illusAiLeadActions}>
            <span className={styles.illusAiLeadStatus}>🔥 New Lead</span>
            <span className={styles.illusAiLeadArrow}>Mark Contacted →</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalyticsIllustration() {
  const bars = [55, 70, 45, 85, 60, 90, 75]
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  return (
    <div className={styles.illus}>
      <div className={styles.illusAnalytics}>
        <div className={styles.illusAnalyticsMetrics}>
          <div className={styles.illusAnalyticsMetric}>
            <div className={styles.illusAnalyticsVal}>98.2%</div>
            <div className={styles.illusAnalyticsLbl}>Resolution Rate</div>
          </div>
          <div className={styles.illusAnalyticsMetric}>
            <div className={styles.illusAnalyticsVal} style={{color: "var(--teal)"}}>1.8s</div>
            <div className={styles.illusAnalyticsLbl}>Avg Response</div>
          </div>
          <div className={styles.illusAnalyticsMetric}>
            <div className={styles.illusAnalyticsVal}>4.9★</div>
            <div className={styles.illusAnalyticsLbl}>Customer Rating</div>
          </div>
        </div>
        <div className={styles.illusAnalyticsChart}>
          {bars.map((h, i) => (
            <div key={i} className={styles.illusAnalyticsBarGroup}>
              <div className={styles.illusAnalyticsBar} style={{ height: `${h}%` }} />
              <div className={styles.illusAnalyticsDay}>{days[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const features = [
  {
    icon: "⚡",
    title: "24/7 Automated Responses",
    description:
      "Your agent never sleeps, never takes a break, and never misses a message. Every customer query gets an instant, intelligent reply — day or night.",
    bullets: [
      "Sub-2 second response time",
      "Handles unlimited concurrent chats",
      "Context-aware multi-turn conversations",
      "Configurable out-of-hours messages",
    ],
    illustration: <ChatIllustration />,
  },
  {
    icon: "📚",
    title: "Knowledge Base",
    description:
      "Upload your documents, PDFs, and website URLs and your agent learns from them instantly. Ask it anything about your business and it answers accurately every time.",
    bullets: [
      "Upload PDFs, Word docs, and text files",
      "Add any webpage URL as a source",
      "Agent answers from your exact content",
      "Update knowledge base anytime",
    ],
    illustration: <KnowledgeBaseIllustration />,
  },
  {
    icon: "🔧",
    title: "Live API Tools",
    description:
      "Connect your own backend APIs so the agent can fetch real-time data during conversations — order status, product availability, delivery tracking, and more.",
    bullets: [
      "Connect any REST API endpoint",
      "Supports GET and POST requests",
      "Fully configurable parameters",
      "Agent decides when to call each tool",
    ],
    illustration: <ToolsIllustration />,
  },
  {
    icon: "🤖",
    title: "Multiple AI Agents",
    description:
      "Run separate AI agents for different brands, departments, or WhatsApp numbers — each with its own personality, knowledge base, and configuration.",
    bullets: [
      "Create agents for sales, support, and more",
      "Each agent fully independent",
      "Manage all agents from one dashboard",
      "Upgrade to unlock additional agents",
    ],
    illustration: <MultiAgentIllustration />,
  },
  {
    icon: "🎯",
    title: "AI Lead Detection",
    description:
      "Your agent automatically identifies high-intent conversations — customers asking about pricing, placing orders, or requesting callbacks — and flags them as leads.",
    bullets: [
      "AI scans every conversation for buying intent",
      "Instant lead card created automatically",
      "Manual flag option from any conversation",
      "Track leads from New → Contacted → Closed",
    ],
    illustration: <AiLeadIllustration />,
  },
  {
    icon: "🎙️",
    title: "Voice Call Support",
    description:
      "Powered by ElevenLabs, your AI agent can handle real voice calls on WhatsApp. Customers can speak naturally and get instant spoken responses. Pro plan only.",
    bullets: [
      "Natural-sounding AI voice",
      "Customisable voice and tone",
      "Call transcripts in dashboard",
      "Seamless text-to-voice handoff",
    ],
    illustration: <VoiceIllustration />,
    pro: true,
  },
  {
    icon: "🖼️",
    title: "Image & Media Sharing",
    description:
      "Your agent can send product photos, PDFs, catalogues, and more. Perfect for retail, real estate, and any business that sells visually.",
    bullets: [
      "Send images, PDFs, and documents",
      "Auto-send catalogue on request",
      "Receive and understand incoming images",
      "Media library management",
    ],
    illustration: <MediaIllustration />,
    pro: true,
  },
  {
    icon: "📊",
    title: "Conversation Analytics",
    description:
      "Understand your customers better with detailed analytics. See what they're asking, when they're most active, and how your agent is performing.",
    bullets: [
      "Daily and weekly conversation reports",
      "Customer satisfaction scoring",
      "Popular question tracking",
      "Response time metrics",
    ],
    illustration: <AnalyticsIllustration />,
  },
]

export default function FeaturesPage() {
  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>Features</div>
            <h1 className={styles.heroTitle}>
              Everything your business needs to
              <br />
              <span>never miss a customer</span>
            </h1>
            <p className={styles.heroSubtitle}>
              From instant responses to deep analytics, D-Zero AI gives you the complete toolkit
              to automate your WhatsApp customer service and grow your business on autopilot.
            </p>
            <Link href="/signup" className={styles.heroCta}>
              Start Free Trial
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </section>

        {/* Feature grid */}
        <section className={styles.featuresSection}>
          <div className={styles.featuresGrid}>
            {features.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                {f.pro && <div className={styles.proBadge}>Pro</div>}
                <div className={styles.featureIllus}>{f.illustration}</div>
                <div className={styles.featureCardBody}>
                  <div className={styles.featureIcon}>{f.icon}</div>
                  <h3 className={styles.featureCardTitle}>{f.title}</h3>
                  <p className={styles.featureCardDesc}>{f.description}</p>
                  <ul className={styles.featureCardBullets}>
                    {f.bullets.map((b) => (
                      <li key={b} className={styles.featureCardBullet}>
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

        {/* Bottom CTA */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaGlow} />
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>Ready to automate your customer service?</h2>
            <p className={styles.ctaDesc}>
              Join businesses across Nigeria using D-Zero AI to handle WhatsApp conversations 24/7.
            </p>
            <div className={styles.ctaButtons}>
              <Link href="/signup" className={styles.ctaPrimary}>Start Free Trial</Link>
              <Link href="/pricing" className={styles.ctaSecondary}>View Pricing</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
