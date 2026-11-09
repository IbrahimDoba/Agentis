"use client"
import { useState } from "react"
import { Reveal } from "./Reveal"
import styles from "./Home.module.css"

export interface Testimonial {
  quote: string
  name: string
  role: string
}

// One quote at a time, picked by name, so a long quote gets the whole width
// instead of three cramped cards.
export function Testimonials({ items }: { items: Testimonial[] }) {
  const [active, setActive] = useState(0)
  const t = items[active]

  return (
    <section className={styles.section}>
      <div className={styles.frame}>
        <Reveal className={styles.quoteBox}>
          <blockquote key={active} className={styles.quote} id="testimonial-quote">
            &ldquo;{t.quote}&rdquo;
          </blockquote>
          <div className={styles.quoteTabs} role="tablist" aria-label="Testimonials">
            {items.map((item, i) => (
              <button
                key={item.name}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls="testimonial-quote"
                className={styles.quoteTab}
                onClick={() => setActive(i)}
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
