import Link from "next/link"
import {
  ArrowRight, BookOpen, Code2, Globe, Hand, Megaphone, ShieldCheck, UserPlus, Users,
} from "lucide-react"
import { PLAN_PRICES, PLAN_PRICES_USD, PLAN_CREDIT_LIMITS, estimatedAiMessages } from "@/lib/plans"
import { STATUS_RECIPIENT_CAPS } from "@/lib/status-post"
import { PAYG_DEFAULT_NGN_PER_CREDIT } from "@/lib/credits"
import { LineWave } from "./LineWave"
import { Reveal } from "./Reveal"
import { PricingPlans } from "./PricingPlans"
import { AgentRadar, BroadcastDemo, FollowUpDemo, MemoryDemo, PipelineDemo, RepliesDemo, StatusDemo } from "./Demos"
import styles from "./Home.module.css"
import hero from "./Hero.module.css"

function Head({ title, quiet, lead }: { title: string; quiet: string; lead?: string }) {
  return (
    <Reveal className={styles.head}>
      <h2 className={styles.h2}>
        {title}
        <span>{quiet}</span>
      </h2>
      {lead && <p className={styles.lead}>{lead}</p>}
    </Reveal>
  )
}

export function NumbersStrip() {
  const items = [
    { value: "24/7", label: "replies, nights and weekends included" },
    { value: "1 tap", label: "to take over any chat" },
    { value: "7 days", label: "free trial, no card needed" },
  ]
  // Two copies side by side so the -50% loop is seamless.
  return (
    <div className={styles.strip}>
      <div className={styles.stripTrack}>
        {[0, 1].map((copy) => (
          <div key={copy} style={{ display: "flex" }} aria-hidden={copy === 1}>
            {items.map((item) => (
              <span key={item.label} className={styles.stripItem}>
                <span className={styles.stripValue}>{item.value}</span>
                {item.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const CAPABILITIES = [
  { icon: BookOpen, name: "Your documents", desc: "Upload price lists and files, or add your website. The AI answers from them." },
  { icon: Megaphone, name: "Ad context", desc: "Knows which Meta ad a customer clicked and greets them about that product." },
  { icon: ShieldCheck, name: "Anti-ban pacing", desc: "Warm-up tiers and human-like send delays keep your WhatsApp number safe." },
  { icon: Code2, name: "Your own tools", desc: "Connect your order lookup or booking system and the AI calls it when needed." },
  { icon: Globe, name: "Website chat", desc: "Add one line to your site and the same AI talks to visitors there too." },
  { icon: Hand, name: "Take over anytime", desc: "Reply from your phone or the dashboard and the AI pauses for that chat." },
  { icon: Users, name: "Team workspaces", desc: "Several numbers and staff in one workspace, each with the right access." },
  { icon: UserPlus, name: "Referrals", desc: "Bring other businesses on board and earn credit when they subscribe." },
]

const INDUSTRIES = ["Fashion", "Real estate", "Food and drinks", "Beauty", "Auto dealers", "Healthcare", "Education", "Logistics", "Events", "Travel"]

export function Products() {
  return (
    <section id="features" className={styles.section}>
      <div className={styles.frame}>
        <Head
          title="Customers message at midnight."
          quiet="Your AI replies in seconds."
          lead="One agent that answers, sells, follows up and posts for you, with every chat in your dashboard."
        />

        <Reveal className={styles.bento}>
          <article className={`${styles.card} ${styles.cardTall}`}>
            <div className={styles.cardTop}>
              <span className={styles.cardName}>Replies</span>
              <span className={styles.tag}>day and night</span>
            </div>
            <div className={styles.demo}>
              <RepliesDemo />
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Every message answered, from your own prices</h3>
              <p className={styles.cardDesc}>
                The AI learns your products, prices and hours, answers like your best salesperson, and hands the chat to you when a person is needed.
              </p>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardName}>Broadcasts</span>
              <span className={styles.tag}>safe pacing</span>
            </div>
            <div className={styles.demo}>
              <BroadcastDemo />
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Message all your customers at once</h3>
              <p className={styles.cardDesc}>Send offers to your contacts at a pace that keeps your number safe, and let the AI handle the replies.</p>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardName}>Status</span>
              <span className={styles.tag}>autopilot</span>
            </div>
            <div className={styles.demo}>
              <StatusDemo />
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>Your Status, posted on schedule</h3>
              <p className={styles.cardDesc}>Save your posts once and Autopilot keeps your Status fresh every day. The AI answers whoever replies.</p>
            </div>
          </article>
        </Reveal>

      </div>
    </section>
  )
}

const SMARTS = [
  {
    name: "Follow-ups",
    tag: "after 24h quiet",
    demo: <FollowUpDemo />,
    title: "Quiet chats, brought back",
    desc: "Finds customers who stopped replying and sends each one a message written for their chat.",
  },
  {
    name: "Lead pipeline",
    tag: "New to Won",
    demo: <PipelineDemo />,
    title: "Every lead, sorted for you",
    desc: "Spots buying intent in every chat and moves leads along, so you know who is ready to pay.",
  },
  {
    name: "Customer memory",
    tag: "every chat",
    demo: <MemoryDemo />,
    title: "Regulars never repeat themselves",
    desc: "Remembers what each customer bought and asked, so a new chat picks up where the last one ended.",
  },
]

export function Smarts() {
  return (
    <section className={styles.section}>
      <div className={styles.frame}>
        <Head
          title="It does the follow-through."
          quiet="Like staff who never forget."
          lead="Beyond answering, your agent chases quiet chats, sorts your leads and remembers your regulars."
        />

        <Reveal className={styles.trio}>
          {SMARTS.map((c) => (
            <article key={c.name} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.cardName}>{c.name}</span>
                <span className={styles.tag}>{c.tag}</span>
              </div>
              <div className={styles.demo}>{c.demo}</div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{c.title}</h3>
                <p className={styles.cardDesc}>{c.desc}</p>
              </div>
            </article>
          ))}
        </Reveal>

        <Reveal>
          <article className={styles.agentCard}>
            <div className={styles.agentVisual}>
              <AgentRadar />
            </div>
            <div className={styles.agentCopy}>
              <div className={styles.agentTop}>
                <span className={styles.agentName}>Your AI agent</span>
                <span className={styles.tag}>trained on your business</span>
              </div>
              <h3 className={styles.agentTitle}>The brain behind every reply</h3>
              <p className={styles.cardDesc}>
                Before it answers, it checks your documents, your prices, your own tools and the ad the customer clicked.
                When it isn&apos;t sure, it hands the chat to you instead of guessing.
              </p>
              <div className={styles.powers}>
                <span className={styles.powersLabel}>Powers</span>
                {["Replies", "Broadcasts", "Status", "Follow-ups"].map((p) => <span key={p} className={styles.industry}>{p}</span>)}
              </div>
            </div>
          </article>
        </Reveal>

        <Reveal className={styles.caps}>
          {CAPABILITIES.map(({ icon: Icon, name, desc }) => (
            <div key={name} className={styles.cap}>
              <span className={styles.capIcon}><Icon size={16} strokeWidth={1.75} aria-hidden="true" /></span>
              <h3 className={styles.capName}>{name}</h3>
              <p className={styles.capDesc}>{desc}</p>
            </div>
          ))}
        </Reveal>
        <Link href="/features" className={styles.textLink}>
          See every feature
          <ArrowRight size={16} aria-hidden="true" />
        </Link>

        <div className={styles.industries}>
          <span className={styles.industriesLabel}>Used by businesses in</span>
          {INDUSTRIES.map((i) => <span key={i} className={styles.industry}>{i}</span>)}
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { title: "Sign up", desc: "Create your account and start your 7-day free trial." },
  { title: "Teach your AI", desc: "Add your products, prices, hours and the way you like to talk." },
  { title: "Connect WhatsApp", desc: "Scan a QR code with your phone. Your number stays yours." },
  { title: "Go live", desc: "Your AI starts replying. Watch every chat and step in anytime." },
]

export function Steps() {
  return (
    <section id="how-it-works" className={styles.section}>
      <div className={styles.frame}>
        <Head title="Live in an afternoon." quiet="No developer needed." />
        <Reveal as="ol" className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={styles.stepNum}>0{i + 1}</span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
            </li>
          ))}
        </Reveal>
        <Link href="/how-it-works" className={styles.textLink}>
          How it works in detail
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

interface PlanCard {
  id: "basic" | "starter" | "pro"
  name: string
  desc: string
  agents: string
  features: string[]
  popular?: boolean
}

const PLANS: PlanCard[] = [
  {
    id: "basic",
    name: "Basic",
    desc: "For small shops starting out with one WhatsApp number.",
    agents: "1 AI WhatsApp agent",
    features: ["Text and image replies", "FAQ handling", "Lead detection and customer memory", "Email support"],
  },
  {
    id: "starter",
    name: "Starter",
    desc: "For small businesses putting their WhatsApp on autopilot.",
    agents: "1 AI WhatsApp agent",
    features: ["Text and image replies", "Advanced FAQ handling", "Conversation dashboard and analytics", "Lead detection and customer memory"],
  },
  {
    id: "pro",
    name: "Pro",
    desc: "For growing businesses with more chats and more than one number.",
    agents: "2 AI WhatsApp agents",
    features: ["Text, image and media sending", "Automated follow-ups", "Multi-language support", "Priority support and analytics"],
    popular: true,
  },
]

// Credits, AI-message estimates and Status reach come from the same constants
// billing and the worker use, so this card can't promise more than the plan gets.
function planLines(plan: PlanCard) {
  const credits = PLAN_CREDIT_LIMITS[plan.id]
  const messages = estimatedAiMessages(credits)
  return [
    plan.agents,
    `${credits.toLocaleString("en-NG")} credits a month${messages ? ` (about ${messages.toLocaleString("en-NG")} AI messages)` : ""}`,
    ...plan.features,
    `WhatsApp Status to up to ${STATUS_RECIPIENT_CAPS[plan.id].toLocaleString("en-NG")} contacts a post, with Autopilot`,
  ]
}

export function Pricing() {
  return (
    <section className={styles.section}>
      <div className={styles.frame}>
        <Head
          title="Simple pricing."
          quiet="Start with 7 days free."
          lead="Every plan comes with monthly credits. A typical AI reply uses about 5 credits, and your AI simply pauses if they run out."
        />
        <PricingPlans
          plans={PLANS.map((plan) => ({
            id: plan.id,
            name: plan.name,
            desc: plan.desc,
            popular: plan.popular,
            naira: PLAN_PRICES[plan.id],
            usd: PLAN_PRICES_USD[plan.id],
            lines: planLines(plan),
          }))}
        />
        <p className={styles.payg}>
          Prefer no subscription? Pay as you go from ₦{PAYG_DEFAULT_NGN_PER_CREDIT.toFixed(2)} a credit, valid for 12 months.
        </p>
        <Link href="/pricing" className={styles.textLink}>
          Compare all plans
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

export function ClosingCta() {
  return (
    <section className={`${styles.section} ${styles.cta}`}>
      <LineWave className={styles.ctaWave} />
      <div className={styles.frame}>
        <div className={styles.ctaRow}>
          <Head
            title="Your customers are messaging right now."
            quiet="Make sure every one gets an answer."
          />
          <div className={styles.ctaButtons}>
            <Link href="/signup" className={hero.primary}>
              Start free trial
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/contact" className={hero.secondary}>Book a demo</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
