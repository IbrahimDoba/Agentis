"use client"
import { useEffect, useRef, useState } from "react"
import styles from "./Demos.module.css"

// Small looping product demos for the home page cards. Each one only plays
// while it is on screen, and the server render is the finished state, so with
// no JS or reduced motion the card still shows the whole story.

function useLive() {
  const ref = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setMoving(true)
    const observer = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, live, moving }
}

// Steps through `times` (ms from the start of a loop) and restarts every
// `period` ms. Returns how many cues have fired, so FINAL = times.length.
function useTimeline(times: number[], period: number) {
  const { ref, live, moving } = useLive()
  const [step, setStep] = useState(times.length)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (moving) setStep(0)
  }, [moving])

  useEffect(() => {
    if (!live) return
    setStep(0)
    const timers = times.map((t, i) => setTimeout(() => setStep(i + 1), t))
    timers.push(setTimeout(() => setCycle((c) => c + 1), period))
    return () => timers.forEach(clearTimeout)
    // times is a module constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, cycle, period])

  return { ref, step, cycle, moving }
}

// Counts up to `to` over `ms` when `run` turns true; shows `to` otherwise.
function Count({ to, run, ms = 1600 }: { to: number; run: boolean; ms?: number }) {
  const [value, setValue] = useState(run ? 0 : to)
  useEffect(() => {
    if (!run) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [run, to, ms])
  return <>{value.toLocaleString("en-NG")}</>
}

const show = (on: boolean) => ({ "data-on": on ? "true" : "false" })

function Typing() {
  return (
    <div className={styles.typing} aria-hidden="true">
      <span /><span /><span />
    </div>
  )
}

/* Replies: a short sale, then a discount request goes to a person. */

const REPLY_CUES = [300, 1100, 2100, 3500, 4200, 5200, 6600, 7300, 8300, 9800, 10600]

export function RepliesDemo() {
  const { ref, step } = useTimeline(REPLY_CUES, 15000)
  return (
    <div ref={ref} className={`${styles.replies} ${styles.fx}`}>
      <div className={styles.chat}>
        <div className={styles.in} {...show(step >= 1)}>Good evening, do you deliver to Abuja?</div>
        {step === 2 ? <Typing /> : (
          <div className={styles.out} {...show(step >= 3)}>Yes we do. Delivery to Abuja takes 2-3 days and costs ₦3,500. Which item would you like?</div>
        )}
        <div className={styles.in} {...show(step >= 4)}>The brown leather bag</div>
        {step === 5 ? <Typing /> : (
          <div className={styles.out} {...show(step >= 6)}>Great choice. It&apos;s ₦28,000. Shall I send you the account details?</div>
        )}
        <div className={styles.in} {...show(step >= 7)}>Yes, send it</div>
        {step === 8 ? <Typing /> : (
          <div className={styles.out} {...show(step >= 9)}>Sent. Once you pay, I&apos;ll confirm your order and delivery date.</div>
        )}
        <div className={styles.in} {...show(step >= 10)}>Can you do ₦25,000 if I buy two?</div>
      </div>
      <div className={styles.handover} {...show(step >= 11)}>
        <span><span className={styles.pulse} aria-hidden="true" />Customer wants a discount</span>
        <span className={styles.handoverBtn}>Take over</span>
      </div>
    </div>
  )
}

/* Broadcasts: contacts light up one by one at a person's pace. */

const DOTS = 40
const REPLIED = new Set([4, 11, 17, 23, 30, 36])

export function BroadcastDemo() {
  const { ref, live, moving } = useLive()
  const [sent, setSent] = useState(DOTS)

  useEffect(() => {
    if (moving) setSent(0)
  }, [moving])

  useEffect(() => {
    if (!live) return
    setSent(0)
    let n = 0
    // 40 contacts in about 5s, then a pause before the next campaign.
    const id = setInterval(() => {
      n = n >= DOTS + 18 ? 0 : n + 1
      setSent(Math.min(n, DOTS))
    }, 125)
    return () => clearInterval(id)
  }, [live])

  const replies = [...REPLIED].filter((i) => i < sent - 4).length
  const done = sent === DOTS

  return (
    <div ref={ref} className={styles.broadcast}>
      <div className={styles.row}>
        <span>Weekend sale</span>
        <span className={styles.mono}>{done ? "sent" : "sending"} {Math.round((sent / DOTS) * 500)}/500</span>
      </div>
      <div className={styles.dots} aria-hidden="true">
        {Array.from({ length: DOTS }, (_, i) => (
          <span key={i} data-state={i >= sent ? "wait" : REPLIED.has(i) && i < sent - 4 ? "replied" : "sent"} />
        ))}
      </div>
      <div className={styles.row}>
        <span className={styles.sub}>Paced like a person</span>
        <span className={styles.sub}><b>{replies}</b> replies, answered by AI</span>
      </div>
    </div>
  )
}

/* Status: posts go out on schedule and the views tick up. */

const POSTS = [
  { title: "Ankara sets, new stock", time: "7:00pm" },
  { title: "Customer review video", time: "9:00am" },
  { title: "Weekend sale, 20% off", time: "12:00pm" },
  { title: "Behind the scenes", time: "6:30pm" },
]

export function StatusDemo() {
  const { ref, live, moving } = useLive()
  const [k, setK] = useState(0)

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setK((v) => v + 1), 3200)
    return () => clearInterval(id)
  }, [live])

  const now = POSTS[k % POSTS.length]
  const next = [POSTS[(k + 1) % POSTS.length], POSTS[(k + 2) % POSTS.length]]
  const segments = (k % 3) + 1

  return (
    <div ref={ref} className={styles.status}>
      <div className={styles.statusRow}>
        <svg className={styles.ring} viewBox="0 0 44 44" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <circle
              key={`${i}-${segments > i ? k : "off"}`}
              cx="22" cy="22" r="20"
              pathLength="100"
              className={styles.seg}
              data-on={segments > i ? "true" : "false"}
              data-draw={moving && i === segments - 1 ? "true" : "false"}
              style={{ transform: `rotate(${-90 + i * 120 + 4}deg)` }}
            />
          ))}
        </svg>
        <div className={styles.statusText} key={k}>
          <div className={styles.row}>
            <span>{now.title}</span>
            <span className={styles.posted}>posted</span>
          </div>
          <div className={styles.sub}><b><Count to={180 + ((k * 97) % 260)} run={live} ms={2600} /></b> views so far</div>
        </div>
      </div>
      <div className={styles.queue}>
        {next.map((p, i) => (
          <div key={`${k}-${i}`} className={styles.queueItem} style={{ animationDelay: `${i * 80}ms` }}>
            {p.title}
            <span className={styles.mono}>{i === 0 ? "next" : "later"} · {p.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Follow-ups: a chat goes quiet, the AI nudges, the customer comes back. */

const FOLLOW_CUES = [400, 2300, 3600]

export function FollowUpDemo() {
  const { ref, step, cycle, moving } = useTimeline(FOLLOW_CUES, 8000)
  return (
    <div ref={ref} className={`${styles.chart} ${styles.fx}`}>
      <svg viewBox="0 0 300 120" preserveAspectRatio="none" className={styles.chartSvg} aria-hidden="true">
        <defs>
          <linearGradient id="fu-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--h-accent)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--h-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g key={cycle} data-draw={moving && step >= 1 ? "true" : "false"} className={styles.chartLine}>
          <path d="M0 40 C 40 42, 70 60, 110 92 S 160 104, 180 100 C 210 92, 230 50, 300 22 L 300 120 L 0 120 Z" fill="url(#fu-area)" className={styles.area} />
          <path d="M0 40 C 40 42, 70 60, 110 92 S 160 104, 180 100 C 210 92, 230 50, 300 22" pathLength="100" className={styles.line} />
        </g>
        <line x1="180" y1="10" x2="180" y2="120" className={styles.marker} {...show(step >= 2)} />
      </svg>
      <span className={styles.chip} style={{ left: 12, top: 12 }} {...show(step >= 2)}>quiet 24h · follow-up sent</span>
      <span className={styles.chip} style={{ right: 12, bottom: 14 }} {...show(step >= 3)}>customer replied ✓</span>
    </div>
  )
}

/* Lead pipeline: chats move from New to Contacted to Won. */

const LEADS = ["Tunde", "Amaka", "Bisi"]
// Column of each lead after each cue; 0 New, 1 Contacted, 2 Won.
const MOVES = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 1, 1], [2, 2, 1]]
const PIPE_CUES = [900, 1900, 2900, 3900, 4900]
const COLUMNS = ["New", "Contacted", "Won"]

export function PipelineDemo() {
  const { ref, step } = useTimeline(PIPE_CUES, 8000)
  const cols = MOVES[Math.min(step, MOVES.length - 1)]
  return (
    <div ref={ref} className={styles.pipe}>
      <div className={styles.pipeHead}>
        {COLUMNS.map((c, i) => (
          <span key={c}>{c} <b className={styles.mono}>{cols.filter((v) => v === i).length}</b></span>
        ))}
      </div>
      <div className={styles.pipeBody}>
        {LEADS.map((name, i) => (
          <span
            key={name}
            className={styles.lead}
            data-won={cols[i] === 2 ? "true" : "false"}
            style={{ transform: `translate(calc(${cols[i]} * (100% + 8px)), ${i * 40}px)` }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

/* Customer memory: a returning customer doesn't have to repeat themselves. */

const MEMORY_CUES = [300, 1300, 2600, 3400]

export function MemoryDemo() {
  const { ref, step } = useTimeline(MEMORY_CUES, 8500)
  return (
    <div ref={ref} className={`${styles.memory} ${styles.fx}`}>
      <div className={styles.in} {...show(step >= 1)}>Same as last time, please</div>
      <div className={styles.recall} {...show(step >= 2)}>
        <span className={styles.mono}>remembers</span>
        <span>black sneakers · size 43 · Lekki</span>
      </div>
      {step === 3 ? <Typing /> : (
        <div className={styles.out} {...show(step >= 4)}>Done. Size 43 to Lekki again, ₦45,000. Same account?</div>
      )}
    </div>
  )
}

/* The agent: a radar sweeping over what it draws on before each reply. */

const SOURCES = [
  { label: "Documents", x: 18, y: 26 },
  { label: "Your tools", x: 84, y: 20 },
  { label: "Ad clicked", x: 92, y: 62 },
  { label: "Memory", x: 22, y: 80 },
  { label: "Prices", x: 62, y: 92 },
]

export function AgentRadar() {
  const { ref, live } = useLive()
  return (
    <div ref={ref} className={styles.radar} data-live={live ? "true" : "false"} aria-hidden="true">
      <span className={styles.radarRing} style={{ inset: "30%" }} />
      <span className={styles.radarRing} style={{ inset: "18%" }} />
      <span className={styles.radarRing} style={{ inset: "6%" }} />
      <span className={styles.sweep} />
      <svg className={styles.links} viewBox="0 0 100 100" preserveAspectRatio="none">
        {SOURCES.map((s) => <line key={s.label} x1="50" y1="50" x2={s.x} y2={s.y} />)}
      </svg>
      {SOURCES.map((s, i) => (
        <span key={s.label} className={styles.source} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${i * 0.7}s` }}>
          <i />
          {s.label}
        </span>
      ))}
      <span className={styles.core} />
    </div>
  )
}
