"use client"
import { useEffect, useRef, useState } from "react"
import { useVisibleInterval } from "@/lib/useVisibleInterval"
import { toTickerCells, formatCount } from "@/lib/odometer"
import type { PublicStats } from "@/lib/queries/publicStats"
import styles from "./LiveCounters.module.css"

// The platform's three lifetime totals as rolling-digit counters. The numbers
// are real: the server render hands down the same counts /api/public/stats
// returns, the component polls, and each digit column rolls to its new place,
// so a visitor sees the product working rather than a decorative animation.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const SPIN_MS = 1800
// The endpoint caches for 60s, so polling faster only re-renders the same value.
const POLL_MS = 20_000

const COUNTERS: { key: keyof PublicStats; label: string }[] = [
  { key: "aiMessages", label: "AI replies sent on WhatsApp" },
  { key: "conversations", label: "Conversations handled" },
  { key: "leads", label: "Leads captured for businesses" },
]

export function LiveCounters({ initial }: { initial: PublicStats | null }) {
  const [stats, setStats] = useState(initial)
  const ref = useRef<HTMLDivElement>(null)
  // "idle" until JS decides to animate, so the server HTML shows real numbers.
  const [phase, setPhase] = useState<"idle" | "waiting" | "running">("idle")

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    setPhase("waiting")
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setPhase("running")
      observer.disconnect()
    }, { threshold: 0.4 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useVisibleInterval(() => {
    fetch("/api/public/stats", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((next: PublicStats | null) => {
        if (!next || typeof next.aiMessages !== "number") return
        // Lifetime totals only grow; a lower number is a stale cache, not news.
        setStats((prev) => (prev
          ? {
            aiMessages: Math.max(prev.aiMessages, next.aiMessages),
            conversations: Math.max(prev.conversations, next.conversations),
            leads: Math.max(prev.leads, next.leads),
          }
          : next))
      })
      .catch(() => {})
  }, POLL_MS)

  // Nothing counted: the count failed, or a fresh database. Three zeros would
  // read worse than no row at all.
  if (!stats || COUNTERS.every((c) => stats[c.key] <= 0)) return null

  return (
    <div ref={ref} className={styles.band}>
      <div className={styles.frame}>
        {COUNTERS.map((c) => (
          <Counter key={c.key} value={stats[c.key]} label={c.label} phase={phase} />
        ))}
      </div>
    </div>
  )
}

function Counter({ value, label, phase }: { value: number; label: string; phase: "idle" | "waiting" | "running" }) {
  const [display, setDisplay] = useState(value)
  const [spun, setSpun] = useState(false)
  const [gain, setGain] = useState(0)
  const previous = useRef(value)

  // Arrival: hold at zero until the row is on screen, then count up once.
  useEffect(() => {
    if (phase === "waiting") setDisplay(0)
    if (phase !== "running") return
    const target = previous.current
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / SPIN_MS)
      // easeOutExpo: spins fast, then settles, the way a counter lands.
      setDisplay(Math.round(target * (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))))
      if (t < 1) frame = requestAnimationFrame(step)
      else setSpun(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [phase])

  // A poll landed. The digit columns roll to the new value under their own CSS
  // transition, and the gain shows beside the number for a moment.
  useEffect(() => {
    const by = value - previous.current
    previous.current = value
    if (phase === "idle" || spun) setDisplay(value)
    if (by <= 0 || !spun) return
    setGain(by)
    const timer = setTimeout(() => setGain(0), 2600)
    return () => clearTimeout(timer)
  }, [value, spun, phase])

  const cells = toTickerCells(display)

  return (
    <div className={styles.counter}>
      <div className={styles.label}>
        <span className={styles.dot} aria-hidden="true" />
        {label}
      </div>
      <div className={styles.value}>
        <span className={styles.srOnly}>{formatCount(value)}</span>
        <span className={styles.odometer} aria-hidden="true" data-rolling={spun ? "true" : "false"}>
          {cells.map((cell, i) =>
            cell.kind === "separator" ? (
              // Keyed on the cell count so crossing a grouping boundary remounts
              // the row instead of sliding a digit into a comma's slot.
              <span key={`${cells.length}-${i}`} className={styles.separator}>{cell.char}</span>
            ) : (
              <span key={`${cells.length}-${i}`} className={styles.digit}>
                <span className={styles.column} style={{ transform: `translateY(${cell.value * -10}%)` }}>
                  {DIGITS.map((d) => <span key={d} className={styles.cell}>{d}</span>)}
                </span>
              </span>
            )
          )}
        </span>
        {gain > 0 && <span key={value} className={styles.gain} aria-hidden="true">+{formatCount(gain)}</span>}
      </div>
    </div>
  )
}
