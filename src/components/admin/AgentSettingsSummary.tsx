import adminStyles from "@/app/admin/agents/[id]/page.module.css"
import styles from "./AgentSettingsSummary.module.css"

export interface AgentLabelRow {
  id: string
  name: string
  isStage: boolean
  stageOrder: number | null
  applyRule: string | null
  aiDisabled: boolean
  aiEnabled: boolean
}

export interface AgentGroupRow {
  id: string
  subject: string | null
  replyMode: string
  lastMessageAt: string | null
}

// Agent fields the owner controls from the dashboard Settings tab. Read-only
// here on purpose: the owner's choices shouldn't be overwritten from admin.
export interface AgentSettings {
  messagingEnabled: boolean
  aiRepliesEnabled: boolean
  replyDelaySeconds: number
  autoPauseOnHumanReply: boolean
  autoResumeAiAfterMinutes: number | null
  pauseOnAiHandoff: boolean
  pauseOnQualifiedLead: boolean
  autoFollowUpEnabled: boolean
  autoFollowUpAfterMinutes: number | null
  adHandoffKeywords: string[]
  labelReplyPolicy: string
  chatTaggingEnabled: boolean
  backgroundTaggingEnabled: boolean
  replyGuardEnabled: boolean
  appointmentSchedulingEnabled: boolean
  productAlbumEnabled: boolean
  groupChatEnabled: boolean
  broadcastPauseOvernight: boolean
  autoSaveContacts: boolean
  contactNameTag: string | null
  leadCriteria: string | null
  handoffCriteria: string | null
}

function onOff(v: boolean) {
  return <span className={styles.flag} data-on={v}>{v ? "On" : "Off"}</span>
}

function minutes(m: number | null) {
  if (m == null) return "Never"
  return m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`
}

export function AgentSettingsSummary({ agent, labels, groups }: { agent: AgentSettings; labels: AgentLabelRow[]; groups: AgentGroupRow[] }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Messaging", onOff(agent.messagingEnabled)],
    ["AI replies", onOff(agent.aiRepliesEnabled)],
    ["Reply delay", agent.replyDelaySeconds > 0 ? `${agent.replyDelaySeconds} s` : "None"],
    ["Pause AI when a human replies", onOff(agent.autoPauseOnHumanReply)],
    ["Resume AI after", minutes(agent.autoResumeAiAfterMinutes)],
    ["Pause on AI handoff", onOff(agent.pauseOnAiHandoff)],
    ["Pause on qualified lead", onOff(agent.pauseOnQualifiedLead)],
    ["Auto follow-up", agent.autoFollowUpEnabled ? `After ${minutes(agent.autoFollowUpAfterMinutes)}` : onOff(false)],
    ["Ad handoff keywords", agent.adHandoffKeywords.length ? agent.adHandoffKeywords.join(", ") : "None"],
    ["Label reply policy", agent.labelReplyPolicy],
    ["Chat tagging", onOff(agent.chatTaggingEnabled)],
    ["Background tagging", onOff(agent.backgroundTaggingEnabled)],
    ["Reply guard", onOff(agent.replyGuardEnabled)],
    ["Appointment booking", onOff(agent.appointmentSchedulingEnabled)],
    ["Product album", onOff(agent.productAlbumEnabled)],
    ["Group chats", onOff(agent.groupChatEnabled)],
    ["Pause broadcasts overnight", onOff(agent.broadcastPauseOvernight)],
    ["Auto-save contacts", agent.autoSaveContacts ? `On${agent.contactNameTag ? `, tagged "${agent.contactNameTag}"` : ""}` : onOff(false)],
  ]

  return (
    <div className={adminStyles.grid}>
      <div className={adminStyles.infoCard}>
        <div className={adminStyles.cardTitle}>Settings</div>
        <p className={styles.note}>What the owner set in their dashboard. Read-only here.</p>
        {rows.map(([label, value]) => (
          <div key={label} className={adminStyles.infoRow}>
            <div className={adminStyles.infoLabel}>{label}</div>
            <div className={adminStyles.infoValue}>{value}</div>
          </div>
        ))}
        {agent.leadCriteria && (
          <div className={adminStyles.infoRow}>
            <div className={adminStyles.infoLabel}>Lead criteria</div>
            <div className={adminStyles.infoValue}>{agent.leadCriteria}</div>
          </div>
        )}
        {agent.handoffCriteria && (
          <div className={adminStyles.infoRow}>
            <div className={adminStyles.infoLabel}>Handoff criteria</div>
            <div className={adminStyles.infoValue}>{agent.handoffCriteria}</div>
          </div>
        )}
      </div>

      <div className={styles.stack}>
        <div className={adminStyles.infoCard}>
          <div className={adminStyles.cardTitle}>Labels ({labels.length})</div>
          {labels.length === 0 ? (
            <p className={styles.note}>No WhatsApp labels synced.</p>
          ) : (
            <ul className={styles.list}>
              {labels.map((l) => (
                <li key={l.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{l.name}</span>
                    <span className={styles.tags}>
                      {l.isStage && <span className={styles.tag}>Stage {l.stageOrder ?? ""}</span>}
                      {l.aiDisabled && <span className={styles.tag} data-tone="warn">AI off</span>}
                      {l.aiEnabled && <span className={styles.tag} data-tone="good">AI on</span>}
                    </span>
                  </div>
                  {l.applyRule && <span className={styles.itemMeta}>Applied when: {l.applyRule}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={adminStyles.infoCard}>
          <div className={adminStyles.cardTitle}>Groups ({groups.length})</div>
          {groups.length === 0 ? (
            <p className={styles.note}>Not in any WhatsApp groups.</p>
          ) : (
            <ul className={styles.list}>
              {groups.map((g) => (
                <li key={g.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{g.subject ?? "Untitled group"}</span>
                    <span className={styles.tag}>Replies: {g.replyMode}</span>
                  </div>
                  <span className={styles.itemMeta}>
                    {g.lastMessageAt ? `Last message ${new Date(g.lastMessageAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No messages yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
