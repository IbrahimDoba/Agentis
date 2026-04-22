import Link from "next/link"
import styles from "./page.module.css"

export const metadata = { title: "WhatsApp Web — Guide" }

const TIERS = [
  { tier: 1, label: "Warmup",  days: 3,  maxDay: 40,   maxHour: 8,   delay: "45–90s" },
  { tier: 2, label: "Starter", days: 7,  maxDay: 150,  maxHour: 25,  delay: "20–45s" },
  { tier: 3, label: "Growth",  days: 21, maxDay: 400,  maxHour: 60,  delay: "10–25s" },
  { tier: 4, label: "Full",    days: null, maxDay: 1500, maxHour: 200, delay: "5–15s" },
]

const FAQS = [
  {
    q: "Will my number get banned?",
    a: "WhatsApp's automated systems flag unusual activity — high volume, short delays, or mass-contacting unknown numbers. D-Zero AI applies warmup pacing and jitter delays to mimic human-like patterns. The risk is low for normal customer-support use cases but cannot be fully eliminated. Business numbers (not personal) are recommended.",
  },
  {
    q: "What happens if I get disconnected?",
    a: "Your auth session is saved to disk. Click Reconnect on the Channels page and your number will re-link without needing to scan the QR code again — as long as you haven't been logged out or banned by WhatsApp.",
  },
  {
    q: "How do I pair without a QR code?",
    a: "Select \u201cPhone Number\u201d on the Channels page, enter your number in international format (e.g. 2348012345678), and click Get Pairing Code. Open WhatsApp \u2192 Linked Devices \u2192 Link a device \u2192 Link with phone number instead, then enter the 8-character code.",
  },
  {
    q: "Does the agent remember previous conversations?",
    a: "Yes. Every conversation thread is stored per phone number. When the same contact messages again, the agent loads the full history and continues where it left off.",
  },
  {
    q: "How many messages can I send per day?",
    a: "It depends on your warmup tier (see the tier table above). Tier 1 limits you to 40 messages/day; Tier 4 allows up to 1,500. Limits are enforced automatically — messages that exceed the cap are queued or rejected.",
  },
  {
    q: "Can I connect multiple numbers?",
    a: "Yes. Create a separate agent for each number. Each agent has its own WhatsApp session, warmup tier, and conversation history.",
  },
  {
    q: "What is the difference between WhatsApp Web and the Business API?",
    a: "WhatsApp Web (this integration) links any personal or business number via the Linked Devices feature — no approval required, but subject to anti-spam enforcement. The official WhatsApp Business API is approved by Meta, offers higher throughput and no risk of ban, but requires business verification and a monthly fee. Contact us to upgrade.",
  },
]

export default function WhatsAppGuide() {
  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard/channels/whatsapp-web" className={styles.back}>
          ← Back to Channels
        </Link>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroIcon}>📱</div>
        <h1 className={styles.heroTitle}>WhatsApp Web — Guide</h1>
        <p className={styles.heroSub}>
          Everything you need to know about connecting, pacing, and staying compliant.
        </p>
      </div>

      {/* How it works */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          {[
            { n: "1", title: "Link your number", body: "Use the QR code or phone-number pairing flow on the Channels page to link any WhatsApp number to your agent." },
            { n: "2", title: "Agent handles messages", body: "Incoming messages are routed to your AI agent. Replies are queued and sent with human-like delays to avoid detection." },
            { n: "3", title: "Conversations are stored", body: "Every thread is saved with the contact's name, number, and full message history so your agent has context on every reply." },
            { n: "4", title: "Tier advances automatically", body: "As your number ages and behaves normally, the warmup system automatically promotes it to higher tiers with larger daily limits." },
          ].map((s) => (
            <div key={s.n} className={styles.step}>
              <div className={styles.stepNum}>{s.n}</div>
              <div>
                <div className={styles.stepTitle}>{s.title}</div>
                <div className={styles.stepBody}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Warmup tiers */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Warmup tiers</h2>
        <p className={styles.sectionDesc}>
          New numbers start on Tier 1 (Warmup). The system automatically advances your number as days pass and no violations are detected. Delays between messages decrease and daily limits increase with each tier.
        </p>
        <div className={styles.tierTable}>
          <div className={styles.tierHeader}>
            <span>Tier</span>
            <span>Name</span>
            <span>Days at tier</span>
            <span>Max / day</span>
            <span>Max / hour</span>
            <span>Reply delay</span>
          </div>
          {TIERS.map((t) => (
            <div key={t.tier} className={styles.tierRow}>
              <span className={styles.tierNum}>{t.tier}</span>
              <span className={styles.tierLabel}>{t.label}</span>
              <span>{t.days !== null ? `${t.days} days` : "—"}</span>
              <span>{t.maxDay.toLocaleString()}</span>
              <span>{t.maxHour}</span>
              <span>{t.delay}</span>
            </div>
          ))}
        </div>
        <p className={styles.note}>
          Tier advancement is checked each time your session connects. Tiers can only go up — disconnecting or restarting does not reset your tier.
        </p>
      </section>

      {/* Best practices */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Best practices</h2>
        <div className={styles.tips}>
          {[
            { icon: "✅", tip: "Use a dedicated business number, not your personal number." },
            { icon: "✅", tip: "Keep the session connected continuously — frequent reconnects look suspicious." },
            { icon: "✅", tip: "Only message people who have already messaged you first (inbound-first model)." },
            { icon: "✅", tip: "Avoid bulk broadcasts to cold contacts — this is the #1 cause of bans." },
            { icon: "✅", tip: "Keep messages conversational and varied — identical repeated messages trigger filters." },
            { icon: "⚠️", tip: "Do not run two sessions on the same number simultaneously." },
            { icon: "⚠️", tip: "Avoid sending links to unknown contacts during the Warmup tier." },
          ].map((t, i) => (
            <div key={i} className={styles.tip}>
              <span className={styles.tipIcon}>{t.icon}</span>
              <span>{t.tip}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Connection methods */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Connection methods</h2>
        <div className={styles.methods}>
          <div className={styles.method}>
            <div className={styles.methodTitle}>QR Code</div>
            <div className={styles.methodBody}>
              Click <strong>Connect WhatsApp</strong> and scan the QR code from WhatsApp → Linked Devices → Link a device. Requires your phone to be nearby. QR codes expire after ~60 seconds — a new one is generated automatically.
            </div>
          </div>
          <div className={styles.method}>
            <div className={styles.methodTitle}>Phone Number (Pairing Code)</div>
            <div className={styles.methodBody}>
              Select <strong>Phone Number</strong>, enter your number in international format without a <code>+</code> (e.g. <code>2348012345678</code>), then click <strong>Get Pairing Code</strong>. In WhatsApp go to Linked Devices → Link a device → Link with phone number instead. Enter the 8-character code. No QR scan needed — useful for headless or remote setups.
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>FAQ</h2>
        <div className={styles.faqs}>
          {FAQS.map((f, i) => (
            <details key={i} className={styles.faq}>
              <summary className={styles.faqQ}>{f.q}</summary>
              <div className={styles.faqA}>{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className={styles.cta}>
        <div className={styles.ctaText}>Need higher limits or production-grade reliability?</div>
        <a href="/contact" className={styles.ctaBtn}>Talk to us about the Business API →</a>
      </div>
    </div>
  )
}
