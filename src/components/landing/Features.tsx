import Link from "next/link"
import {
  ArrowPathIcon, ArrowsRightLeftIcon, BookOpenIcon, BookmarkIcon, CodeBracketIcon, CursorArrowRaysIcon,
  FunnelIcon, GiftIcon, GlobeAltIcon, MegaphoneIcon, ShieldCheckIcon, UsersIcon,
} from "@heroicons/react/24/outline"
import { Ticks } from "./Ticks"
import styles from "./Features.module.css"

function PhoneMockup() {
  return (
    <div className={styles.phoneMockup}>
      <div className={styles.phoneHeader}>
        <div className={styles.phoneAvatar}>C</div>
        <div>
          <div className={styles.phoneContact}>Chioma A.</div>
          <div className={styles.phoneStatus}>online</div>
        </div>
      </div>
      <div className={styles.phoneChat}>
        <div className={styles.chatBubbleUser}>
          Good morning, when will my order arrive?
          <span className={styles.bubbleTime}>8:14 AM</span>
        </div>
        <div className={styles.chatBubbleAgent}>
          Good morning Chioma. Your 3 yards of navy Adire go out today, and delivery within Lagos is free
          <span className={styles.bubbleTime}>8:14 AM <Ticks className={styles.bubbleTicks} /></span>
        </div>
        <div className={styles.chatBubbleUser}>
          Can I speak to someone about a bulk order?
          <span className={styles.bubbleTime}>8:15 AM</span>
        </div>
        <div className={styles.chatBubbleAgent}>
          Of course. I’ve told the team, and they’ll reply here shortly
          <span className={styles.bubbleTime}>8:15 AM <Ticks className={styles.bubbleTicks} /></span>
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
        <div className={styles.dashBadge}>Live</div>
      </div>
      <div className={styles.dashMetrics}>
        <div className={styles.dashMetric}>
          <div className={styles.dashMetricValue}>1,247</div>
          <div className={styles.dashMetricLabel}>Total</div>
        </div>
        <div className={styles.dashMetric}>
          <div className={styles.dashMetricValue} >34</div>
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
            style={{ height: `${h}%`, background: i === 11 ? "var(--accent)" : undefined }}
          />
        ))}
      </div>
      <div className={styles.dashConvList}>
        {[
          { name: "Chioma A.", msg: "When will my order arrive?", time: "now", active: true },
          { name: "Emeka O.", msg: "Do you have this in size XL?", time: "2m" },
          { name: "Fatima K.", msg: "Thank you, great service", time: "5m" },
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
        <div className={styles.configTitle}>Configure your agent</div>
        <div className={styles.configStep}>Step 2 of 3</div>
      </div>
      <div className={styles.configForm}>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Business name</div>
          <div className={styles.configInput}>Chukwu Fabrics Ltd.</div>
        </div>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Agent personality</div>
          <div className={styles.configSelect}>
            <span>Friendly and professional</span>
            <span className={styles.configChevron}>›</span>
          </div>
        </div>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Response language</div>
          <div className={styles.configTags}>
            <span className={styles.configTag}>English</span>
            <span className={styles.configTag}>Pidgin</span>
            <span className={styles.configTagAdd}>+ Add</span>
          </div>
        </div>
        <div className={styles.configField}>
          <div className={styles.configLabel}>Business hours</div>
          <div className={styles.configInput}>Mon-Sat, 8am-8pm</div>
        </div>
        <div className={styles.configAI}>
          <div>
            <div className={styles.configAITitle}>Suggest FAQs</div>
            <div className={styles.configAIDesc}>Drafted from your website</div>
          </div>
          <div className={styles.configToggle} />
        </div>
      </div>
      <div className={styles.configFooter}>
        <div className={styles.configProgress}>
          <div className={styles.configProgressBar} />
        </div>
        <div className={styles.configSave}>Save and continue</div>
      </div>
    </div>
  )
}

const features = [
  {
    label: "Replies",
    title: "Every message answered within seconds",
    description:
      "Your AI agent reads and replies to every WhatsApp message, 24 hours a day, 7 days a week, and passes the chat to you when a person is needed.",
    bullets: [
      "Replies within seconds, day and night",
      "Follows the whole conversation, not one message at a time",
      "Handles many chats at once",
      "Hands off to your team when needed",
    ],
    mockup: <PhoneMockup />,
    reverse: false,
  },
  {
    label: "Dashboard",
    title: "See every conversation in one place",
    description:
      "Watch customer chats as they happen, read full transcripts and see what your customers actually ask for.",
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
    title: "Tell it about your business",
    description:
      "Add your business details, choose how your agent should sound and set its languages. No technical knowledge required.",
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

const industries = [
  "E-commerce", "Fashion Retail", "Real Estate", "Healthcare", "Food & Beverage",
  "Education", "Logistics", "Beauty & Wellness", "Auto Dealerships", "Travel & Tourism",
  "Event Planning", "Professional Services", "Financial Services", "Hospitality",
]

// "More capabilities" grid — everything not big enough for a full mockup
// section but still worth surfacing on the landing page. Kept in sync with
// public/llms.txt and the /features page.
const moreCapabilities = [
  {
    Icon: ArrowPathIcon,
    title: "AI-personalised follow-ups",
    desc: "The agent finds stale conversations, drafts a message for each contact and sends them over 24 hours with anti-ban pacing. Review them first or let it send.",
  },
  {
    Icon: MegaphoneIcon,
    title: "Broadcast campaigns",
    desc: "Send one WhatsApp campaign to your contact list with pacing set by your number’s warmup tier, pause and resume controls, and an auto-stop on repeated failures.",
  },
  {
    Icon: FunnelIcon,
    title: "Lead detection and pipeline",
    desc: "Every conversation is scanned for buying intent. Leads land in a New, Contacted, Won pipeline, so a hot enquiry doesn’t get lost.",
  },
  {
    Icon: BookOpenIcon,
    title: "Knowledge base",
    desc: "Upload PDFs, Word docs or text files. The agent finds the relevant part for each question, so answers stay accurate as your business grows.",
  },
  {
    Icon: CodeBracketIcon,
    title: "Custom webhook tools",
    desc: "Plug in your own REST APIs for order lookup, payment status or booking. The agent decides when to call each one based on the conversation.",
  },
  {
    Icon: GlobeAltIcon,
    title: "Embeddable web widget",
    desc: "Add one script tag to your website and the same agent talks to visitors there too. Those chats land in the same dashboard as WhatsApp.",
  },
  {
    Icon: CursorArrowRaysIcon,
    title: "Click-to-WhatsApp ad context",
    desc: "When a customer clicks your Meta ad, the agent already knows which product or offer brought them in, and greets them with it.",
  },
  {
    Icon: BookmarkIcon,
    title: "Customer memory",
    desc: "The agent remembers what each contact bought, asked or complained about, so new chats start with context.",
  },
  {
    Icon: ShieldCheckIcon,
    title: "WhatsApp anti-ban safety",
    desc: "Warmup tiers, business-hours awareness, throttle detection, human-like send delays and batch breaks, all there to keep your number alive.",
  },
  {
    Icon: ArrowsRightLeftIcon,
    title: "Live operator handoff",
    desc: "Take over any chat from the dashboard or your phone. The AI pauses for that chat until you hand it back.",
  },
  {
    Icon: GiftIcon,
    title: "Referral program",
    desc: "Bring other businesses on board and earn credit when they subscribe. Track your referrals and earnings from the dashboard.",
  },
  {
    Icon: UsersIcon,
    title: "Multi-agent workspaces",
    desc: "One workspace, an AI agent per WhatsApp number, and team members with role-based access.",
  },
]

export function Features() {
  return (
    <section id="features" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Built for businesses that can’t afford to miss a customer</h2>
        <p className={styles.sectionSubtitle}>
          Reply faster to every customer without adding to your workload.
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
                    <Ticks className={styles.bulletCheck} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.moreCapsSection}>
        <div className={styles.moreCapsHeader}>
          <h3 className={styles.moreCapsTitle}>Everything else it takes to sell on WhatsApp</h3>
        </div>
        <div className={styles.moreCapsGrid}>
          {moreCapabilities.map((c) => (
            <div key={c.title} className={styles.moreCapCard}>
              <div className={styles.moreCapName}>
                <c.Icon width={18} height={18} strokeWidth={1.5} aria-hidden="true" />
                {c.title}
              </div>
              <p className={styles.moreCapDesc}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.industries}>
        Built for {industries.join(", ").toLowerCase()}
      </p>

      <div className={styles.featuresCta}>
        <Link href="/features" className={styles.featuresCtaLink}>
          Explore all features
        </Link>
      </div>
    </section>
  )
}

export default Features
