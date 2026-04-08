"use client"

import React, { useEffect, useRef, useState } from "react"
import styles from "./TestAgentWidget.module.css"

const SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed"

interface TestAgentWidgetProps {
  agentId: string // ElevenLabs agent ID
}

export function TestAgentWidget({ agentId }: TestAgentWidgetProps) {
  const [open, setOpen] = useState(false)
  const scriptLoaded = useRef(false)

  // Load the widget script once, lazily when the user opens the panel
  useEffect(() => {
    if (!open || scriptLoaded.current) return
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      scriptLoaded.current = true
      return
    }
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.type = "text/javascript"
    script.onload = () => { scriptLoaded.current = true }
    document.body.appendChild(script)
  }, [open])

  return (
    <>
      {/* Trigger button */}
      <button className={styles.triggerBtn} onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Test Agent
      </button>

      {/* Modal overlay */}
      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <span className={styles.liveDot} />
                Live Test
              </div>
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.hint}>
                Talk to your agent live. Allow microphone access when prompted.
              </p>
              <div className={styles.widgetWrap}>
                {React.createElement("elevenlabs-convai", { "agent-id": agentId })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
