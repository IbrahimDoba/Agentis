import Link from "next/link"
import Image from "next/image"
import styles from "./AgentCard.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"
import type { AgentPublic } from "@/types"

interface AgentCardProps {
  agent: AgentPublic
}

export function AgentCard({ agent }: AgentCardProps) {
  const isActive = agent.status === "ACTIVE"
  const hasPendingReview = agent.status === "PENDING_REVIEW"
  const isSettingUp = agent.status === "SETTING_UP"

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.info}>
          <div className={styles.name}>{agent.businessName}</div>
          <div className={styles.meta}>Created {formatDate(agent.createdAt)}</div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className={styles.body}>
        <div className={styles.detail}>
          <div className={styles.detailLabel}>Operating Hours</div>
          <div className={styles.detailValue}>{agent.operatingHours}</div>
        </div>
        <div className={styles.detail}>
          <div className={styles.detailLabel}>WhatsApp Name</div>
          <div className={styles.detailValue}>
            {agent.whatsappBusinessName || "Not set"}
          </div>
        </div>
        {agent.websiteLinks && (
          <div className={styles.detail}>
            <div className={styles.detailLabel}>Website</div>
            <div className={styles.detailValue}>{agent.websiteLinks}</div>
          </div>
        )}
        {agent.elevenlabsAgentId && (
          <div className={styles.detail}>
            <div className={styles.detailLabel}>Agent ID</div>
            <div className={styles.detailValue}>{agent.elevenlabsAgentId}</div>
          </div>
        )}
      </div>

      {(hasPendingReview || isSettingUp) && (
        <div className={styles.pendingBox}>
          <span className={styles.pendingIcon}>
            {hasPendingReview ? "🔍" : "⚙️"}
          </span>
          <div>
            <strong>
              {hasPendingReview ? "Under review" : "Being set up"}
            </strong>
            <br />
            {hasPendingReview
              ? "Our team is reviewing your agent configuration. We'll notify you when it's ready."
              : "We're connecting your agent to WhatsApp. This usually takes a few hours."}
          </div>
        </div>
      )}

      {isActive && agent.whatsappAgentLink && (
        <div className={styles.waSection}>
          <div className={styles.waSectionTitle}>
            💚 WhatsApp Connected
          </div>
          <div className={styles.waDetails}>
            {agent.whatsappPhoneNumber && (
              <div className={styles.waRow}>
                <span className={styles.waLabel}>Phone:</span>
                <span className={styles.waValue}>{agent.whatsappPhoneNumber}</span>
              </div>
            )}
            <div className={styles.waRow}>
              <span className={styles.waLabel}>Chat link:</span>
              <a
                href={agent.whatsappAgentLink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.waLink}
              >
                Open on WhatsApp ↗
              </a>
            </div>

            {agent.qrCodeUrl && (
              <div className={styles.qrWrap}>
                <div className={styles.qrLabel}>Scan to start chatting:</div>
                <Image
                  src={agent.qrCodeUrl}
                  alt="WhatsApp QR Code"
                  width={120}
                  height={120}
                  className={styles.qrImg}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <Link href={`/dashboard/agent/${agent.id}`}>
          <Button variant="secondary" size="sm">View Details</Button>
        </Link>
        <Link href={`/dashboard/agent/${agent.id}`}>
          <Button variant="ghost" size="sm">Edit Agent</Button>
        </Link>
        {isActive && (
          <Link href="/dashboard/chats">
            <Button variant="ghost" size="sm">View Chats</Button>
          </Link>
        )}
        <span className={styles.updatedAt}>
          Updated {formatDate(agent.updatedAt)}
        </span>
      </div>
    </div>
  )
}

export default AgentCard
