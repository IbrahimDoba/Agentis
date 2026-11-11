"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { MessageCircle, Megaphone, ShoppingBag, UserPlus } from "lucide-react"
import { LineWave } from "@/components/home/LineWave"
import { geist, geistMono } from "@/components/home/fonts"
import home from "@/components/home/Home.module.css"
import styles from "./AuthShowcase.module.css"

// The left half of the auth screens on dailzero.com. Sign-up is an illustration
// of the promise (the shop sleeps, the phone keeps answering); every other auth screen
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

/* Sign-up: an illustration of a shop closed for the night while the phone
   out front keeps answering. Drawn in SVG so it follows the theme. */

const REPLIES = ["₦45,000, size 43 is in stock", "Yes, we deliver to Abuja", "Booked for Friday 2pm"]

function NightShop() {
  return (
    <>
      <p className={styles.h}>
        Your shop is closed.
        <span>Your WhatsApp isn&apos;t.</span>
      </p>
      <svg className={styles.art} viewBox="0 0 520 440" role="presentation">
        {/* sky */}
        <g transform="translate(-330 -14)">
          <g className={styles.moon}>
            <circle cx="430" cy="70" r="30" className={styles.fillAccentSoft} />
            <path d="M442 44a30 30 0 1 0 14 44 24 24 0 0 1-14-44z" className={styles.fillAccent} />
          </g>
        </g>
        {[[30, 120, 0], [180, 30, 1.2], [230, 84, 0.5], [320, 40, 2], [400, 20, 1.6], [490, 70, 0.8], [36, 190, 2.4]].map(([x, y, d]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2" className={styles.star} style={{ animationDelay: `${d}s` }} />
        ))}

        {/* ground */}
        <path d="M10 400h500" className={styles.line} />
        <path d="M40 412h70M150 412h36M330 412h120" className={styles.lineFaint} />

        {/* shop */}
        <rect x="70" y="190" width="270" height="210" rx="6" className={styles.body} />
        <path d="M58 190h294l-14-46H72z" className={styles.roof} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${58 + i * 42} 190a21 21 0 0 0 42 0`} className={i % 2 ? styles.scallop : styles.scallopAccent} />
        ))}
        <rect x="150" y="112" width="110" height="30" rx="6" className={styles.body} />
        <path d="M172 127h66" className={styles.lineAccent} />

        {/* window with shelves */}
        <rect x="92" y="236" width="130" height="110" rx="4" className={styles.glass} />
        <path d="M92 290h130M157 236v110" className={styles.lineFaint} />
        <rect x="104" y="266" width="18" height="24" rx="3" className={styles.item} />
        <rect x="128" y="258" width="16" height="32" rx="3" className={styles.item} />
        <circle cx="186" cy="278" r="11" className={styles.item} />
        <rect x="170" y="318" width="34" height="22" rx="4" className={styles.item} />
        <path d="M106 340h36l-6-18h-24z" className={styles.item} />

        {/* door with the closed sign */}
        <rect x="246" y="250" width="72" height="150" rx="4" className={styles.glass} />
        <circle cx="258" cy="330" r="3" className={styles.fillAccent} />
        <g className={styles.sign}>
          <path d="M282 262v14" className={styles.line} />
          <rect x="258" y="276" width="48" height="24" rx="4" className={styles.body} />
          <text x="282" y="292" textAnchor="middle" className={styles.signText}>CLOSED</text>
        </g>

        {/* sleeping */}
        <text x="286" y="130" className={`${styles.zzz} ${styles.z1}`}>z</text>
        <text x="300" y="108" className={`${styles.zzz} ${styles.z2}`}>z</text>
        <text x="316" y="82" className={`${styles.zzz} ${styles.z3}`}>Z</text>

        {/* phone */}
        <g className={styles.phone}>
          <rect x="372" y="222" width="104" height="182" rx="18" className={styles.phoneBody} />
          <rect x="381" y="236" width="86" height="154" rx="10" className={styles.screen} />
          <rect x="412" y="228" width="24" height="4" rx="2" className={styles.lineFill} />
          <rect x="388" y="250" width="50" height="14" rx="7" className={`${styles.msgIn} ${styles.m1}`} />
          <rect x="410" y="272" width="50" height="14" rx="7" className={`${styles.msgOut} ${styles.m2}`} />
          <rect x="388" y="294" width="40" height="14" rx="7" className={`${styles.msgIn} ${styles.m3}`} />
          <rect x="402" y="316" width="58" height="14" rx="7" className={`${styles.msgOut} ${styles.m4}`} />
          <rect x="388" y="338" width="46" height="14" rx="7" className={`${styles.msgIn} ${styles.m5}`} />
          <rect x="414" y="360" width="46" height="14" rx="7" className={`${styles.msgOut} ${styles.m6}`} />
        </g>

        {/* answers floating up from the phone */}
        {REPLIES.map((text, i) => (
          <g key={text} className={styles.reply} style={{ animationDelay: `${i * 2.4}s` }}>
            <rect x={296 - i * 6} y="150" width="214" height="34" rx="17" className={styles.replyBox} />
            <circle cx={314 - i * 6} cy="167" r="8" className={styles.fillAccent} />
            <path d={`M${310 - i * 6} 167l3 3 5-6`} className={styles.tick} />
            <text x={330 - i * 6} y="172" className={styles.replyText}>{text}</text>
          </g>
        ))}
      </svg>
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
      <div className={styles.inner}>{signup ? <NightShop /> : <Feed />}</div>
    </aside>
  )
}
