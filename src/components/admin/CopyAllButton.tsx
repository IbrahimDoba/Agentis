"use client"
import { useState } from "react"
import { Copy, Check } from "lucide-react"
import styles from "./CopyAllButton.module.css"

export function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button className={`${styles.btn} ${copied ? styles.copied : ""}`} onClick={copy}>
      {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy All</>}
    </button>
  )
}
