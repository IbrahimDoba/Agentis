"use client"
import { useState } from "react"
import { DocumentDuplicateIcon, CheckIcon } from "@heroicons/react/24/outline"
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
      {copied ? <><CheckIcon width={13} height={13} /> Copied</> : <><DocumentDuplicateIcon width={13} height={13} /> Copy All</>}
    </button>
  )
}
