"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Check, MessageCircle, Megaphone, ShoppingBag, UserPlus } from "lucide-react"
import { LogoIcon } from "@/components/landing/Logo"
import { LineWave } from "@/components/home/LineWave"
import { geist, geistMono } from "@/components/home/fonts"
import home from "@/components/home/Home.module.css"
import styles from "./AuthShowcase.module.css"

// The left half of the auth screens on dailzero.com. Sign-up shows what the
// product does (questions go in, answers come out); every other auth screen
// greets a returning owner with what their agent has been doing. Decorative,
// so it is hidden from screen readers and on narrow screens.

function useTick(ms: number) {
  const [tick, setTick] = useState(0)
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setMoving(true)
    const id = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return { tick, moving }
}

/* Sign-up: questions drop into the logo, answers come out the other side. */

const PAIRS = [
  { q: "How much is the black sneakers?", a: "₦45,000, and size 43 is in stock." },
  { q: "Do you deliver to Abuja?", a: "Yes. 2-3 days, ₦3,500 delivery." },
  { q: "Are you open on Sunday?", a: "Yes, 10am to 6pm every Sunday." },
  { q: "Can I book for Friday 2pm?", a: "Booked. I'll remind you on Thursday." },
  { q: "Is the brown bag still available?", a: "Yes, 3 left. Shall I reserve one?" },
]

function Flow() {
  const { tick, moving } = useTick(3600)
  const pair = PAIRS[tick % PAIRS.length]
  return (
    <>
      <p className={styles.h}>
        Questions in.
        <span>Answers out.</span>
      </p>
      <div className={styles.flow} data-moving={moving ? "true" : "false"}>
        <div className={styles.lane}>
          <div key={`q${tick}`} className={`${styles.bubble} ${styles.q}`}>{pair.q}</div>
        </div>
        <div className={styles.core}>
          <span key={`r${tick}`} className={styles.ripple} />
          <span className={styles.ring} />
          <span className={styles.ring} />
          <span className={styles.mark}><LogoIcon size={56} /></span>
        </div>
        <div className={styles.lane}>
          <div key={`a${tick}`} className={`${styles.bubble} ${styles.a}`}>
            {pair.a}
            <span className={styles.stamp}><Check size={12} aria-hidden="true" /> answered in seconds</span>
          </div>
        </div>
      </div>
      <p className={styles.foot}>Start free for 7 days. No card needed.</p>
    </>
  )
}

/* Sign-in: a feed of what the agent did while the owner was away. */

const EVENTS = [
  { icon: MessageCircle, text: "Replied to Amaka about delivery", time: "11:47pm" },
  { icon: ShoppingBag, text: "Took an order for black sneakers", time: "11:52pm" },
  { icon: UserPlus, text: "Saved a new lead, Tunde", time: "12:10am" },
  { icon: MessageCircle, text: "Answered a price question", time: "1:34am" },
  { icon: Megaphone, text: "Posted your Status on schedule", time: "7:00am" },
  { icon: MessageCircle, text: "Followed up with a quiet chat", time: "8:15am" },
  { icon: ShoppingBag, text: "Booked an appointment for Friday", time: "9:02am" },
]

const SHOWN = 5

function Feed() {
  const { tick, moving } = useTick(2400)
  // Newest on top; the list slides down as each event arrives.
  const rows = Array.from({ length: SHOWN }, (_, i) => {
    const n = tick + SHOWN - 1 - i
    return { n, ...EVENTS[n % EVENTS.length] }
  })
  return (
    <>
      <p className={styles.h}>
        Welcome back.
        <span>Your agent kept working.</span>
      </p>
      <div className={styles.feed} data-moving={moving ? "true" : "false"}>
        <div className={styles.feedHead}>
          <span className={styles.live}><i />While you were away</span>
          <span className={styles.mono}>example</span>
        </div>
        <ul className={styles.rows}>
          {rows.map(({ n, icon: Icon, text, time }, i) => (
            <li key={n} className={styles.row} style={{ transform: `translateY(${i * 60}px)`, opacity: i === SHOWN - 1 ? 0.35 : 1 }}>
              <span className={styles.rowIcon}><Icon size={15} strokeWidth={1.75} aria-hidden="true" /></span>
              <span className={styles.rowText}>{text}</span>
              <span className={styles.mono}>{time}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.foot}>Sign in to see every chat, lead and order.</p>
    </>
  )
}

export function AuthShowcase() {
  const signup = usePathname().startsWith("/signup")
  return (
    <aside className={`${home.page} ${geist.variable} ${geistMono.variable} ${styles.panel}`} aria-hidden="true">
      <LineWave className={styles.wave} />
      <div className={styles.inner}>{signup ? <Flow /> : <Feed />}</div>
    </aside>
  )
}
