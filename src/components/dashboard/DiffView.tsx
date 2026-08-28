"use client"

import { wordDiff } from "@/lib/textDiff"
import styles from "./DiffView.module.css"

export interface DiffHunkView {
  note: string
  op: string
  removed: string
  added: string
  contextBefore: string
  contextAfter: string
  line: number
}

/**
 * Renders the edits we already know about. Nothing is computed at document
 * scale — each hunk carries its own context from the server, and the word diff
 * runs only inside a hunk.
 */
export function DiffView({ hunks }: { hunks: DiffHunkView[] }) {
  if (hunks.length === 0) return null

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        {hunks.length === 1 ? "1 change" : `${hunks.length} changes`}
      </div>
      {hunks.map((h, i) => {
        const parts = h.removed && h.added ? wordDiff(h.removed, h.added) : null
        return (
          <div key={i} className={styles.hunk}>
            <div className={styles.hunkHead}>
              <span className={styles.note}>{h.note || "Change"}</span>
              <span className={styles.line}>line {h.line}</span>
            </div>
            <pre className={styles.body}>
              {h.contextBefore && <span className={styles.context}>{h.contextBefore}</span>}
              {parts ? (
                <>
                  <span className={styles.removedLine}>
                    {parts
                      .filter((p) => p.kind !== "added")
                      .map((p, j) => (
                        <span key={j} className={p.kind === "removed" ? styles.removedWord : undefined}>
                          {p.value}
                        </span>
                      ))}
                  </span>
                  <span className={styles.addedLine}>
                    {parts
                      .filter((p) => p.kind !== "removed")
                      .map((p, j) => (
                        <span key={j} className={p.kind === "added" ? styles.addedWord : undefined}>
                          {p.value}
                        </span>
                      ))}
                  </span>
                </>
              ) : (
                <>
                  {h.removed && <span className={styles.removedLine}>{h.removed}</span>}
                  {h.added && <span className={styles.addedLine}>{h.added}</span>}
                </>
              )}
              {h.contextAfter && <span className={styles.context}>{h.contextAfter}</span>}
            </pre>
          </div>
        )
      })}
    </div>
  )
}
