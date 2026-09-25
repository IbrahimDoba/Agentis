"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { MessagesSquare, UserRoundCheck, MessageCircleMore } from "lucide-react"
import { useVisibleInterval } from "@/lib/useVisibleInterval"
import { toTickerCells, formatCount } from "@/lib/odometer"
import type { PublicStats } from "@/lib/queries/publicStats"
import styles from "./LiveStats.module.css"

// The hero's three counters, rendered as rolling-digit tickers.
//
// The numbers are real: they come from the same counts /api/public/stats
// returns, handed down from the server render so the first paint is already
// correct (and correct with JS off). From there the component polls, and each
// digit column rolls to its new position — so a visitor watching the page sees
// the product actually working, not a decorative animation.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// One spin on arrival. Long enough to read as a counter settling, short enough
// that it is finished before anyone has scrolled past the hero.
const SPIN_MS = 1400

// Traffic on these numbers is measured in a handful a minute, and the endpoint
// caches for 60s, so anything faster than this just re-renders the same value.
const POLL_MS = 20_000

// useLayoutEffect warns when React renders it on the server. The spin has to run
// before paint (it rewinds the counter to zero first), so on the client we want
// the layout variant and on the server the effect never runs at all.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect

export function LiveStats({ initial }: { initial: PublicStats | null }) {
  const [stats, setStats] = useState(initial)

  useVisibleInterval(() => {
    fetch("/api/public/stats", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((next) => {
        // A 503 or a half-written payload leaves the last good numbers on
        // screen. Nothing about a marketing counter is worth an error state.
        if (next && typeof next.aiMessages === "number") setStats(next)
      })
      .catch(() => {})
  }, POLL_MS)

  // Nothing counted yet: the server render failed and no poll has succeeded
  // either. The hero drops the strip rather than showing three zeros.
  if (!stats) return null

  return (
    <div className={styles.stats}>
      <StatTicker
        icon={<MessagesSquare size={20} strokeWidth={1.75} aria-hidden="true" />}
        value={stats.aiMessages}
        label="AI Messages Sent"
      />
      <StatTicker
        icon={<UserRoundCheck size={20} strokeWidth={1.75} aria-hidden="true" />}
        value={stats.leads}
        label="Leads Captured"
      />
      <StatTicker
        icon={<MessageCircleMore size={20} strokeWidth={1.75} aria-hidden="true" />}
        value={stats.conversations}
        label="Conversations Handled"
      />
    </div>
  )
}

function StatTicker({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  // Starts at the real value so the server HTML and the first client render
  // agree. The spin below rewinds to zero before the browser paints, so the
  // final number is never visibly on screen first.
  const [display, setDisplay] = useState(value)
  const [spinning, setSpinning] = useState(false)
  const [bumped, setBumped] = useState(false)
  const previous = useRef(value)

  // Mount only, by design: this is the arrival spin, and a later poll must not
  // restart it. Value changes after mount are handled by the effect below.
  useBeforePaint(() => {
    const target = value
    if (target <= 0) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    setSpinning(true)
    setDisplay(0)

    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / SPIN_MS)
      // easeOutExpo — spins fast, then settles, the way a counter lands.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setDisplay(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(step)
      else setSpinning(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  // A poll landed. No rewind and no rAF here: the digit columns roll from where
  // they are to where they belong under their own CSS transition, which is the
  // whole point of the ticker. Held until any spin finishes so the two cannot
  // drive the same value at once.
  useEffect(() => {
    if (!spinning) setDisplay(value)
  }, [value, spinning])

  // Flash the card's edge when the number goes up, so it reads as a live count
  // rather than a number that happens to be animated.
  useEffect(() => {
    if (value <= previous.current) {
      previous.current = value
      return
    }
    previous.current = value
    setBumped(true)
    const timer = setTimeout(() => setBumped(false), 900)
    return () => clearTimeout(timer)
  }, [value])

  const cells = toTickerCells(display)

  return (
    <div className={bumped ? `${styles.card} ${styles.cardBumped}` : styles.card}>
      <span className={styles.icon}>{icon}</span>
      <div>
        <div className={styles.value}>
          <span className={styles.srOnly}>{formatCount(display)}</span>
          <span
            className={styles.odometer}
            aria-hidden="true"
            data-spinning={spinning ? "" : undefined}
          >
            {cells.map((cell, i) =>
              cell.kind === "separator" ? (
                // Keyed on the cell count so crossing a grouping boundary
                // remounts the row instead of sliding a digit into a comma's slot.
                <span key={`${cells.length}-${i}`} className={styles.separator}>
                  {cell.char}
                </span>
              ) : (
                <span key={`${cells.length}-${i}`} className={styles.digit}>
                  <span
                    className={styles.column}
                    style={{ transform: `translateY(${cell.value * -10}%)` }}
                  >
                    {DIGITS.map((digit) => (
                      <span key={digit} className={styles.digitCell}>
                        {digit}
                      </span>
                    ))}
                  </span>
                </span>
              )
            )}
          </span>
        </div>
        <div className={styles.label}>{label}</div>
      </div>
    </div>
  )
}

export default LiveStats
