"use client"
import { useState } from "react"
import { DocumentDuplicateIcon, CheckIcon } from "@heroicons/react/24/outline"
import styles from "./CopyableField.module.css"

interface Props {
  label: string
  value: string
}

export function CopyableField({ label, value }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.row}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <button className={`${styles.copyBtn} ${copied ? styles.copied : ""}`} onClick={copy}>
          {copied ? <><CheckIcon width={12} height={12} /> Copied</> : <><DocumentDuplicateIcon width={12} height={12} /> Copy</>}
        </button>
      </div>
      <div className={styles.scrollBox}>{value}</div>
    </div>
  )
}
