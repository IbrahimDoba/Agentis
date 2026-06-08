"use client"

import { useState } from "react"
import styles from "./CodeTabs.module.css"

export interface CodeSample {
  label: string
  code: string
}

// Small client-side language switcher for a set of equivalent code samples
// (e.g. cURL / JavaScript / Python). Used across the developer docs page.
export function CodeTabs({ samples }: { samples: CodeSample[] }) {
  const [active, setActive] = useState(0)
  const current = samples[active] ?? samples[0]

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist">
        {samples.map((s, i) => (
          <button
            key={s.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`${styles.tab} ${i === active ? styles.active : ""}`}
            onClick={() => setActive(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <pre className={styles.code}>{current.code}</pre>
    </div>
  )
}
