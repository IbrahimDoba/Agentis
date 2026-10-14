"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline"
import styles from "./AgentListCard.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import { useToast } from "@/context/ToastContext"
import { formatDate } from "@/lib/utils"
import type { AgentPublic } from "@/types"

interface AgentListCardProps {
  agent: AgentPublic
}

function Avatar({ src, name, size = 56 }: { src?: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        className={styles.avatar}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div className={styles.avatarFallback} style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

export function AgentListCard({ agent }: AgentListCardProps) {
  const { showToast } = useToast()
  const [copied, setCopied] = useState(false)

  const copyId = async (e: React.MouseEvent) => {
    // The whole card is a link — keep the copy click from navigating.
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(agent.id)
      setCopied(true)
      showToast("Agent ID copied")
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast("Couldn't copy the agent ID.", "error")
    }
  }

  return (
    <Link href={`/dashboard/agent/${agent.id}`} className={styles.card}>
      <div className={styles.top}>
        <Avatar src={agent.profileImageUrl} name={agent.businessName} />
        <div className={styles.info}>
          <div className={styles.name}>{agent.businessName}</div>
          {agent.category && (
            <div className={styles.category}>{agent.category}</div>
          )}
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {agent.businessDescription && (
        <p className={styles.description}>{agent.businessDescription}</p>
      )}

      <div className={styles.idRow}>
        <code className={styles.idCode} title={agent.id}>
          ID: {agent.id}
        </code>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={(e) => void copyId(e)}
          title="Copy agent ID"
        >
          {copied ? <CheckIcon width={13} height={13} /> : <ClipboardDocumentIcon width={13} height={13} />}
        </button>
      </div>

      <div className={styles.footer}>
        <span className={styles.date}>Created {formatDate(agent.createdAt)}</span>
        <span className={styles.manage}>Manage →</span>
      </div>
    </Link>
  )
}

export default AgentListCard
