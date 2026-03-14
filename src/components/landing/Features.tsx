import Link from "next/link"
import styles from "./Features.module.css"

function PhoneMockup() {
  return (
    <div className={styles.phoneMockup}>
      <div className={styles.phoneHeader}>
        <div className={styles.phoneHeaderLeft}>
          <div className={styles.phoneAvatar}>W</div>
          <div>
            <div className={styles.phoneContact}>Agentis AI</div>
            <div className={styles.phoneStatus}>
              <span className={styles.onlineDot} />
              Online
            </div>
          </div>
        </div>
        <div className={styles.phoneActions}>
          <div className={styles.phoneActionBtn} />
          <div className={styles.phoneActionBtn} />
        </div>
      </div>
      <div className={styles.phoneChat}>
        <div className={styles.chatBubbleUser}>
          Hi! Do you have the Adire fabric in blue?
          <span className={styles.bubbleTime}>2:31 PM ✓✓</span>
        </div>
        <div className={styles.chatBubbleAgent}>
          Yes! We have Adire fabric available in sky blue, navy, and indigo. Prices start from ₦4,500 per yard. Would you like to place an order or see more designs? 😊
          <span className={styles.bubbleTime}>2:31 PM</span>
        </div>
        <div className={styles.chatBubbleUser}>
          How much for 3 yards of navy?
          <span className={styles.bubbleTime}>2:32 PM ✓✓</span>
        </div>
        <div className={styles.chatBubbleAgent}>
          3 yards of navy Adire would be ₦13,500. We offer free delivery within Lagos. Want to proceed? 🎉
          <span className={styles.bubbleTime}>2:32 PM</span>
        </div>
        <div className={styles.typingIndicator}>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

function DashboardMockup() {
  return (
    <div className={styles.dashMockup}>
      <div className={styles.dashHeader}>
        <div className={styles.dashTitle}>Conversations</div>
        <div className={styles.dashHeaderRight}>
          <div className={styles.dashBadge}>Live</div>
        </div>
      </div>
      <div className={styles.dashMetrics}>
        <div className={styles.dashMetric}>
          <div className={styles.dashMetricValue}>1,247</div>
          <div className={styles.dashMetricLabel}>Total</div>
        </div>
        <div className={styles.dashMetric}>
          <div className={styles.dashMetricValue} style={{color: "var(--accent)"}}>34</div>
          <div className={styles.dashMetricLabel}>Active</div>
        </div>
        <div className={styles.dashMetric}>
          <div className={styles.dashMetricValue}>98%</div>
          <div className={styles.dashMetricLabel}>Resolved</div>
        </div>
      </div>
      <div className={styles.dashChart}>
        {[40, 65, 50, 80, 70, 90, 75, 95, 85, 100, 88, 92].map((h, i) => (
          <div
            key={i}
            className={styles.chartBar}
            style={{ height: `${h}%`, opacity: i === 11 ? 1 : 0.5 + (i / 24) }}
          />
        ))}
      </div>
      <div className={styles.dashConvList}>
        {[
          { name: "Chioma A.", msg: "When will my order arrive?", time: "now", active: true },
          { name: "Emeka O.", msg: "Do you have this in size XL?", time: "2m" },
          { name: "Fatima K.", msg: "Thanks! Great service 🙏", time: "5m" },
        ].map((c) => (
          <div key={c.name} className={`${styles.dashConvItem} ${c.active ? styles.dashConvActive : ""}`}>
            <div className={styles.dashConvAvatar}>{c.name[0]}</div>
            <div className={styles.dashConvInfo}>
              <div className={styles.dashConvName}>{c.name}</div>
              <div className={styles.dashConvMsg}>{c.msg}</div>
            </div>
            <div className={styles.dashConvTime}>{c.time}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfigMockup() {
  return (
    <div className={styles.configMockup}>
      <div className={styles.configHeader}>
        <div className={styles.configTitle}>Configure Your Agent</div>
        <div className={styles.configStep}>Step 2 of 3</div>
      </div>
      <div className={styles.configForm}>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Business Name</div>
          <div className={styles.configInput}>Chukwu Fabrics Ltd.</div>
        </div>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Agent Personality</div>
          <div className={styles.configSelect}>
            <span>Friendly &amp; Professional</span>
            <span className={styles.configChevron}>›</span>
          </div>
        </div>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Response Language</div>
          <div className={styles.configTags}>
            <span className={styles.configTag}>English</span>
            <span className={styles.configTag}>Pidgin</span>
            <span className={styles.configTagAdd}>+ Add</span>
          </div>
        </div>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Business Hours</div>
          <div className={styles.configInput}>Mon–Sat, 8am – 8pm</div>
        </div>
        <div className={styles.configAI}>
          <div className={styles.configAIIcon}>✨</div>
          <div>
            <div className={styles.configAITitle}>AI Enhancement</div>
            <div className={styles.configAIDesc}>Auto-generate FAQs from your website</div>
          </div>
          <div className={styles.configToggle} />
        </div>
      </div>
      <div className={styles.configFooter}>
        <div className={styles.configProgress}>
          <div className={styles.configProgressBar} />
        </div>
        <div className={styles.configSave}>Save &amp; Continue →</div>
      </div>
    </div>
  )
}

const features = [
  {
    label: "Core Feature",
    title: "Instant AI Responses",
    description:
      "Your AI agent reads and replies to every WhatsApp message within seconds — 24 hours a day, 7 days a week. No human intervention needed for routine queries.",
    bullets: [
      "Sub-2 second average response time",
      "Context-aware multi-turn conversations",
      "Handles unlimited concurrent chats",
      "Smart handoff to human agents when needed",
    ],
    mockup: <PhoneMockup />,
    reverse: false,
  },
  {
    label: "Visibility",
    title: "Full Conversation Dashboard",
    description:
      "Monitor every customer interaction in real-time from a clean, intuitive dashboard. Track trends, review transcripts, and see what your customers actually need.",
    bullets: [
      "Live conversation feed with search",
      "Conversation analytics and trends",
      "Customer satisfaction tracking",
      "Full transcript history",
    ],
    mockup: <DashboardMockup />,
    reverse: true,
  },
  {
    label: "Setup",
    title: "Easy Agent Configuration",
    description:
      "Setting up your AI agent takes minutes, not weeks. Tell us about your business, define your agent's personality, and we handle the rest. No technical knowledge required.",
    bullets: [
      "Guided setup wizard",
      "AI-generated FAQ suggestions",
      "Custom greeting and sign-off messages",
      "Multiple language support",
    ],
    mockup: <ConfigMockup />,
    reverse: false,
  },
]

const marqueeItems = [
  "E-commerce", "Fashion Retail", "Real Estate", "Healthcare", "Food & Beverage",
  "Education", "Logistics", "Beauty & Wellness", "Auto Dealerships", "Travel & Tourism",
  "Event Planning", "Professional Services", "Financial Services", "Hospitality",
]

export function Features() {
  return (
    <section id="features" className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionLabel}>Features</div>
        <h2 className={styles.sectionTitle}>Built for businesses that can't afford to miss a customer</h2>
        <p className={styles.sectionSubtitle}>
          Every feature is designed to make your business more responsive without adding to your workload.
        </p>
      </div>

      <div className={styles.featureList}>
        {features.map((f) => (
          <div key={f.title} className={`${styles.featureRow} ${f.reverse ? styles.featureRowReverse : ""}`}>
            <div className={styles.featureMockup}>{f.mockup}</div>
            <div className={styles.featureContent}>
              <div className={styles.featureLabel}>{f.label}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.description}</p>
              <ul className={styles.featureBullets}>
                {f.bullets.map((b) => (
                  <li key={b} className={styles.featureBullet}>
                    <span className={styles.bulletCheck}>✓</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.marqueeSection}>
        <div className={styles.marqueeLabel}>Trusted by businesses across every industry</div>
        <div className={styles.marqueeWrapper}>
          <div className={styles.marqueeTrack}>
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <div key={i} className={styles.marqueeItem}>{item}</div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.featuresCta}>
        <Link href="/features" className={styles.featuresCtaLink}>
          Explore all features
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </section>
  )
}

export default Features
