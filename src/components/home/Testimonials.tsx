"use client"
import { useEffect, useState } from "react"
import { Reveal } from "./Reveal"
import styles from "./Home.module.css"

export interface Testimonial {
  quote: string
  name: string
  role: string
}

// One quote at a time, picked by name, so a long quote gets the whole width
// instead of three cramped cards. It moves on by itself every few seconds,
// and stops for good once someone picks a name or points at the quote.
const ADVANCE_MS = 7000

export function Testimonials({ items }: { items: Testimonial[] }) {
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(false)
  const t = items[active]

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(true)
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = setTimeout(() => setActive((i) => (i + 1) % items.length), ADVANCE_MS)
    return () => clearTimeout(id)
  }, [auto, active, items.length])

  return (
    <section className={styles.section}>
      <div className={styles.frame}>
        <Reveal className={styles.quoteBox}>
          <blockquote key={active} className={styles.quote} id="testimonial-quote">
            &ldquo;{t.quote}&rdquo;
          </blockquote>
          <div
            className={styles.quoteTabs}
            role="tablist"
            aria-label="Testimonials"
            data-auto={auto ? "true" : "false"}
            onPointerEnter={() => setAuto(false)}
            onFocus={() => setAuto(false)}
          >
            {items.map((item, i) => (
              <button
                key={item.name}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls="testimonial-quote"
                className={styles.quoteTab}
                onClick={() => {
                  setAuto(false)
                  setActive(i)
                }}
              >
                <span className={styles.quoteName}>{item.name}</span>
                <span className={styles.quoteRole}>{item.role}</span>
              </button>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
