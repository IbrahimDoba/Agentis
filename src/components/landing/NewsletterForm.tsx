"use client"

import { useState } from "react"
import styles from "./NewsletterForm.module.css"

export function NewsletterForm() {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setState("loading")
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      setState("done")
    } catch {
      setState("error")
    }
  }

  if (state === "done") {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>✓</span>
        You&apos;re subscribed!
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.label}>Stay in the loop</p>
      <div className={styles.row}>
        <input
          type="email"
          className={styles.input}
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={state === "loading"}
        />
        <button type="submit" className={styles.btn} disabled={state === "loading"}>
          {state === "loading" ? "…" : "Subscribe"}
        </button>
      </div>
      {state === "error" && <p className={styles.error}>Something went wrong. Try again.</p>}
    </form>
  )
}
