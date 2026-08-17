"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Button from "@/components/ui/Button"
import styles from "./MetaChatPanel.module.css"

// Live conversation on the official Cloud API number: inbound customer messages,
// the AI's replies, and a composer for replying as a human. This is the
// whatsapp_business_messaging surface — the send path and the webhook that
// receives customer messages are both behind that permission.

interface StoredMessage {
  id: string
  waId: string
  direction: "inbound" | "outbound"
  text: string
  waMessageId: string | null
  createdAt: string
}

interface Persona {
  agentId: string
  businessName: string
}

const POLL_MS = 1500

export function MetaChatPanel() {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [persona, setPersona] = useState<Persona | null>(null)
  const [to, setTo] = useState("")
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/messages", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      setPersona(data.persona)
      // Server returns newest-first; a chat thread reads oldest-first.
      setMessages([...(data.messages as StoredMessage[])].reverse())
    } catch {
      // Best-effort poll — a dropped request just retries next tick.
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  // Prefill the recipient from whoever last messaged in, so replying as a human
  // doesn't mean copying a number by hand.
  useEffect(() => {
    if (to) return
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound")
    if (lastInbound) setTo(lastInbound.waId)
  }, [messages, to])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const res = await fetch("/api/meta/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || "Send failed")
      else {
        setText("")
        poll()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Conversation</h2>
          <p className={styles.sub}>
            Live messages on your official WhatsApp number
            {persona && <> — AI replying as <strong>{persona.businessName}</strong></>}
          </p>
        </div>
        <code className={styles.scope}>whatsapp_business_messaging</code>
      </header>

      <div className={styles.feed} ref={feedRef}>
        {messages.length === 0 && (
          <p className={styles.empty}>
            No messages yet. When a customer messages your WhatsApp number their message
            appears here and the AI replies automatically.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`${styles.bubble} ${
              m.direction === "inbound" ? styles.inbound : styles.outbound
            }`}
          >
            <span className={styles.bubbleMeta}>
              {m.direction === "inbound" ? m.waId : "You / AI"} ·{" "}
              {new Date(m.createdAt).toLocaleTimeString()}
            </span>
            <span className={styles.bubbleText}>{m.text}</span>
          </div>
        ))}
      </div>

      <form className={styles.composer} onSubmit={handleSend}>
        <input
          className={styles.input}
          placeholder="Recipient number"
          value={to}
          onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <input
          className={`${styles.input} ${styles.grow}`}
          placeholder="Reply as a human…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button disabled={sending || !to || !text}>{sending ? "Sending…" : "Send"}</Button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}
