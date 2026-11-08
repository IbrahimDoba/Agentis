"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import styles from "./UserTable.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { useToast } from "@/context/ToastContext"
import { formatDate } from "@/lib/utils"
import { formatNaira, PLAN_ORDER, PLAN_LABELS } from "@/lib/plans"
import { BILLING_STATE_LABELS, type UserBillingState } from "@/lib/userBillingState"
import { UserStatusPanel, UserWhatsAppPanel, UserActivityPanel, UserTeamPanel } from "./UserInsightsPanels"
import type { UserPublic } from "@/types"

export interface AdminUserRow extends UserPublic {
  agentCount: number
  billing: {
    state: UserBillingState
    creditsUsed: number
    walletCreditsUsed: number
    creditLimit: number
    walletBalance: number
    walletUsable: boolean
  }
}

export interface UserListQuery {
  q: string
  billing: UserBillingState | ""
  plan: string
  status: string
  onboarding: "incomplete" | ""
  sort: "newest" | "credits" | "wallet" | "name"
  page: number
}

interface UserTableProps {
  users: AdminUserRow[]
  query: UserListQuery
  total: number
  matching: number
  pageCount: number
  stateCounts: Record<UserBillingState, number>
}

interface BillingData {
  plan: string
  creditLimit: number
  monthlyCreditsUsed: number
  totalCreditsUsed: number
  overageCredits: number
  overageChargeNaira: number | null
  subscriptionExpired: boolean
  walletBalance: number
  walletExpiresAt: string | null
  monthlyBreakdown: { text: number; image: number; voice: number }
  sourceBreakdown: Array<{ source: string; credits: number; walletCredits: number }>
  agentBreakdown: Array<{ id: string; businessName: string; runtime: string; transportType: string; monthlyCredits: number; conversationCount: number }>
  agents: { id: string; status: string; messagingEnabled: boolean; businessName: string; whatsappPhoneNumber: string | null; whatsappPhoneNumberId: string | null; whatsappAgentLink: string | null }[]
}

interface AgentMessagingState {
  [agentId: string]: { enabled: boolean; saving: boolean }
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ""
  return new Date(iso).toISOString().split("T")[0]
}

function addMonthsToDate(base: string, months: number): string {
  const d = base ? new Date(base) : new Date()
  if (isNaN(d.getTime())) return base
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split("T")[0]
}

type ModalTab = "account" | "subscription" | "agents" | "status" | "whatsapp" | "activity" | "team"

const MODAL_TABS: Array<{ id: ModalTab; label: string }> = [
  { id: "account", label: "Account" },
  { id: "subscription", label: "Billing" },
  { id: "agents", label: "Agents" },
  { id: "status", label: "Status" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "activity", label: "Activity" },
  { id: "team", label: "Team" },
]

const SOURCE_LABELS: Record<string, string> = {
  ai: "AI replies",
  human: "Human replies",
  broadcast: "Broadcasts",
  followup: "Follow-ups",
  status: "Status posts",
  contact_save: "Contact saving",
}

function UserDetailModal({ user, onClose, onStatusChange, loading }: {
  user: AdminUserRow
  onClose: () => void
  onStatusChange: (userId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") => void
  loading: string | null
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [tab, setTab] = useState<ModalTab>("account")
  const [maxAgents, setMaxAgents] = useState<number>(user.maxAgents ?? 1)
  const [savingMaxAgents, setSavingMaxAgents] = useState(false)
  const [maxAgentsSaved, setMaxAgentsSaved] = useState(false)
  const [plan, setPlan] = useState<string>(user.plan ?? "free")
  const [savingPlan, setSavingPlan] = useState(false)
  const [planSaved, setPlanSaved] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string>(toDateInputValue(user.subscriptionExpiresAt))
  const [savingExpiry, setSavingExpiry] = useState(false)
  const [expirySaved, setExpirySaved] = useState(false)
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [agentMessaging, setAgentMessaging] = useState<AgentMessagingState>({})
  const [allocAmount, setAllocAmount] = useState("")
  const [allocating, setAllocating] = useState(false)
  const [allocMsg, setAllocMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/billing`)
      .then((r) => r.json())
      .then((data: BillingData) => {
        setBilling(data)
        const state: AgentMessagingState = {}
        data.agents.forEach((a) => { state[a.id] = { enabled: a.messagingEnabled, saving: false } })
        setAgentMessaging(state)
      })
      .catch(() => {})
      .finally(() => setBillingLoading(false))
  }, [user.id])

  const handleToggleMessaging = async (agentId: string, enabled: boolean) => {
    setAgentMessaging((prev) => ({ ...prev, [agentId]: { ...prev[agentId], saving: true } }))
    try {
      const res = await fetch(`/api/agents/${agentId}/messaging`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error("Failed")
      setAgentMessaging((prev) => ({ ...prev, [agentId]: { enabled, saving: false } }))
    } catch {
      setAgentMessaging((prev) => ({ ...prev, [agentId]: { ...prev[agentId], saving: false } }))
      showToast("Couldn't update messaging", "error")
    }
  }

  const patch = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Failed to update")
    router.refresh()
  }

  const handleSaveMaxAgents = async () => {
    setSavingMaxAgents(true)
    try {
      await patch({ maxAgents })
      setMaxAgentsSaved(true)
      setTimeout(() => setMaxAgentsSaved(false), 2000)
    } catch { showToast("Couldn't update the agent limit", "error") }
    finally { setSavingMaxAgents(false) }
  }

  const handleSavePlan = async () => {
    setSavingPlan(true)
    try {
      await patch({ plan })
      setPlanSaved(true)
      setTimeout(() => setPlanSaved(false), 2000)
    } catch { showToast("Couldn't update the plan", "error") }
    finally { setSavingPlan(false) }
  }

  const handleSaveExpiry = async (dateStr?: string) => {
    const value = dateStr ?? expiresAt
    setSavingExpiry(true)
    try {
      await patch({ subscriptionExpiresAt: value ? new Date(value).toISOString() : null })
      if (dateStr) setExpiresAt(dateStr)
      setExpirySaved(true)
      setTimeout(() => setExpirySaved(false), 2000)
    } catch { showToast("Couldn't update the expiry date", "error") }
    finally { setSavingExpiry(false) }
  }

  const [resettingUsage, setResettingUsage] = useState(false)
  const [usageReset, setUsageReset] = useState(false)
  const handleResetUsage = async () => {
    setResettingUsage(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-usage`, { method: "POST" })
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      if (data.subscriptionExpiresAt) {
        setExpiresAt(toDateInputValue(data.subscriptionExpiresAt))
      }
      // Refresh the billing panel so the "this month" totals update
      setBillingLoading(true)
      const billingRes = await fetch(`/api/admin/users/${user.id}/billing`)
      if (billingRes.ok) {
        const billingData: BillingData = await billingRes.json()
        setBilling(billingData)
      }
      setBillingLoading(false)
      setUsageReset(true)
      setTimeout(() => setUsageReset(false), 2500)
      router.refresh()
    } catch {
      showToast("Couldn't reset usage", "error")
    } finally {
      setResettingUsage(false)
    }
  }

  const handleAllocate = async (action: "add" | "deduct" = "add") => {
    const amt = Math.floor(Number(allocAmount))
    if (!Number.isFinite(amt) || amt <= 0) { setAllocMsg("Enter a positive amount of credits"); return }
    setAllocating(true); setAllocMsg(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, action }),
      })
      const data = await res.json()
      if (!res.ok) { setAllocMsg(data.error || `Failed to ${action} credits`); return }
      setAllocAmount("")
      const verb = action === "deduct" ? "Removed" : "Added"
      setAllocMsg(`${verb} ${amt.toLocaleString()} credits — new balance ${Number(data.creditBalance).toLocaleString()}${data.creditsExpireAt ? `, expires ${formatDate(data.creditsExpireAt)}` : ""}.`)
      setBilling((prev) => prev ? { ...prev, walletBalance: data.creditBalance, walletExpiresAt: data.creditsExpireAt } : prev)
      router.refresh()
    } catch {
      setAllocMsg(`Failed to ${action} credits`)
    } finally {
      setAllocating(false)
    }
  }

  const expiryDate = expiresAt ? new Date(expiresAt) : null
  const isExpired = expiryDate ? expiryDate < new Date() : false
  const creditPct = billing && billing.creditLimit > 0
    ? Math.min(100, Math.round((billing.monthlyCreditsUsed / billing.creditLimit) * 100))
    : 0
  const agentCount = billing?.agents.length ?? 0
  const pausedCount = Object.values(agentMessaging).filter((s) => !s.enabled).length

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={user.name}
      footer={
        <div className={styles.modalActions}>
          {user.status !== "APPROVED" && (
            <Button size="sm" variant="primary" loading={loading === `${user.id}-APPROVED`}
              onClick={() => onStatusChange(user.id, "APPROVED")}>Approve</Button>
          )}
          {user.status === "APPROVED" && (
            <Button size="sm" variant="danger" loading={loading === `${user.id}-SUSPENDED`}
              onClick={() => onStatusChange(user.id, "SUSPENDED")}>Suspend</Button>
          )}
          {user.status === "SUSPENDED" && (
            <Button size="sm" variant="primary" loading={loading === `${user.id}-APPROVED`}
              onClick={() => onStatusChange(user.id, "APPROVED")}>Unsuspend</Button>
          )}
          {user.status !== "REJECTED" && user.status !== "SUSPENDED" && (
            <Button size="sm" variant="danger" loading={loading === `${user.id}-REJECTED`}
              onClick={() => onStatusChange(user.id, "REJECTED")}>Reject</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }
    >
      {/* Tab bar */}
      <div className={styles.tabBar} role="tablist" aria-label="User details">
        {MODAL_TABS.map((t) => (
          <button
            key={t.id}
            id={`user-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="user-tabpanel"
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? styles.tabActive : styles.tabBtn}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
              const i = MODAL_TABS.findIndex((x) => x.id === tab)
              const next = MODAL_TABS[(i + (e.key === "ArrowRight" ? 1 : MODAL_TABS.length - 1)) % MODAL_TABS.length]
              setTab(next.id)
              document.getElementById(`user-tab-${next.id}`)?.focus()
            }}
          >
            {t.label}
            {t.id === "subscription" && user.billing.state === "payg" && (
              <span className={styles.tabBadge}>PAYG</span>
            )}
            {t.id === "subscription" && billing && creditPct >= 75 && user.billing.state !== "payg" && (
              <span className={styles.tabBadgeDanger}>{creditPct}%</span>
            )}
            {t.id === "agents" && agentCount > 0 && (
              <span className={pausedCount > 0 ? styles.tabBadgeDanger : styles.tabBadge}>{agentCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.modalBody} id="user-tabpanel" role="tabpanel" aria-labelledby={`user-tab-${tab}`}>

        {tab === "status" && <UserStatusPanel userId={user.id} />}
        {tab === "whatsapp" && <UserWhatsAppPanel userId={user.id} />}
        {tab === "activity" && <UserActivityPanel userId={user.id} />}
        {tab === "team" && <UserTeamPanel userId={user.id} />}

        {/* ── Account tab ── */}
        {tab === "account" && (
          <>
            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>Personal</div>
              <div className={styles.modalGrid}>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Email</span>
                  <span className={styles.modalValue}>{user.email}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Phone</span>
                  <span className={styles.modalValue}>{user.phone ?? <span className={styles.empty}>—</span>}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Heard about us</span>
                  <span className={styles.modalValue}>{user.referralSource ?? <span className={styles.empty}>—</span>}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Status</span>
                  <span className={styles.modalValue}><StatusBadge status={user.status} /></span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Role</span>
                  <span className={styles.modalValue}>{user.role}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Joined</span>
                  <span className={styles.modalValue}>{formatDate(user.createdAt)}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Onboarding</span>
                  <span className={styles.modalValue}>{user.onboardingCompleted ? "✓ Completed" : "Not completed"}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Agent Limit</span>
                  <span className={styles.modalValue}>
                    <div className={styles.agentLimitRow}>
                      <input type="number" min={1} max={20} value={maxAgents}
                        onChange={(e) => setMaxAgents(Math.max(1, Math.min(20, Number(e.target.value))))}
                        className={styles.agentLimitInput} />
                      <button className={styles.agentLimitSaveBtn} onClick={handleSaveMaxAgents}
                        disabled={savingMaxAgents || maxAgents === (user.maxAgents ?? 1)}>
                        {savingMaxAgents ? "Saving…" : maxAgentsSaved ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>Business</div>
              <div className={styles.modalGrid}>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Name</span>
                  <span className={styles.modalValue}>{user.businessName}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Category</span>
                  <span className={styles.modalValue}>{user.businessCategory ?? <span className={styles.empty}>—</span>}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Email</span>
                  <span className={styles.modalValue}>{user.businessEmail ?? <span className={styles.empty}>—</span>}</span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Website</span>
                  <span className={styles.modalValue}>
                    {user.businessWebsite
                      ? <a href={user.businessWebsite} target="_blank" rel="noreferrer" className={styles.link}>{user.businessWebsite}</a>
                      : <span className={styles.empty}>—</span>}
                  </span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Address</span>
                  <span className={styles.modalValue}>{user.businessAddress ?? <span className={styles.empty}>—</span>}</span>
                </div>
                {user.businessDescription && (
                  <div className={styles.modalRowFull}>
                    <span className={styles.modalLabel}>Description</span>
                    <p className={styles.modalDesc}>{user.businessDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Subscription tab ── */}
        {tab === "subscription" && (
          <>
            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>Plan</div>
              <div className={styles.modalGrid}>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Plan</span>
                  <span className={styles.modalValue}>
                    <div className={styles.agentLimitRow}>
                      {/* Driven by PLAN_ORDER so this can't drift from the ladder
                          again — it was hand-written and silently missing Basic,
                          which the PATCH route has always accepted.
                          A plan that isn't ON the ladder (reseller) is prepended
                          so the select shows what the user is actually on; without
                          it the value matches no option and the box reads "Free". */}
                      <select value={plan} onChange={(e) => setPlan(e.target.value)} className={styles.agentLimitInput}>
                        {(PLAN_ORDER.includes(plan) ? PLAN_ORDER : [plan, ...PLAN_ORDER]).map((p) => (
                          <option key={p} value={p}>{PLAN_LABELS[p] ?? p}</option>
                        ))}
                      </select>
                      <button className={styles.agentLimitSaveBtn} onClick={handleSavePlan}
                        disabled={savingPlan || plan === (user.plan ?? "free")}>
                        {savingPlan ? "Saving…" : planSaved ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                  </span>
                </div>
                <div className={styles.modalRow}>
                  <span className={styles.modalLabel}>Expires</span>
                  <span className={styles.modalValue}>
                    <div className={styles.expiryBlock}>
                      <div className={styles.agentLimitRow}>
                        <input type="date" value={expiresAt}
                          onChange={(e) => setExpiresAt(e.target.value)}
                          className={styles.dateInput} />
                        <button className={styles.agentLimitSaveBtn} onClick={() => handleSaveExpiry()}
                          disabled={savingExpiry}>
                          {savingExpiry ? "Saving…" : expirySaved ? "Saved ✓" : "Save"}
                        </button>
                      </div>
                      <div className={styles.expiryQuickRow}>
                        {[1, 3, 12].map((m) => (
                          <button key={m} className={styles.quickBtn}
                            onClick={() => { const d = addMonthsToDate(expiresAt, m); handleSaveExpiry(d) }}>
                            +{m === 12 ? "1yr" : `${m}mo`}
                          </button>
                        ))}
                        <button className={styles.quickBtn}
                          onClick={() => {
                            const d = new Date(); d.setDate(d.getDate() + 7)
                            const s = d.toISOString().slice(0, 10)
                            setExpiresAt(s); handleSaveExpiry(s)
                          }}>
                          7-day trial
                        </button>
                        <button className={styles.quickBtnClear}
                          onClick={() => {
                            const d = new Date(); d.setDate(d.getDate() - 1)
                            const s = d.toISOString().slice(0, 10)
                            setExpiresAt(s); handleSaveExpiry(s)
                          }}>
                          Expire now
                        </button>
                        {expiresAt && (
                          <button className={styles.quickBtnClear}
                            onClick={() => { setExpiresAt(""); handleSaveExpiry("") }}>
                            Clear
                          </button>
                        )}
                      </div>
                      {expiresAt && (
                        <span className={isExpired ? styles.expiredBadge : styles.activeBadge}>
                          {isExpired ? "Expired" : `Active · expires ${formatDate(new Date(expiresAt).toISOString())}`}
                        </span>
                      )}
                      <div className={styles.resetUsageRow}>
                        <button
                          className={styles.resetUsageBtn}
                          onClick={handleResetUsage}
                          disabled={resettingUsage}
                          title="Set subscription to 30 days from now and reset the rolling usage window. Use this when the customer pays for another month."
                        >
                          {resettingUsage ? "Resetting…" : usageReset ? "Reset ✓" : "Reset usage / New cycle"}
                        </button>
                        <span className={styles.resetUsageHint}>
                          Starts a fresh 30-day window from today.
                        </span>
                      </div>
                    </div>
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>Credits this cycle</div>
              <div className={styles.billingStateRow}>
                <span className={styles.stateBadge} data-state={user.billing.state}>{BILLING_STATE_LABELS[user.billing.state]}</span>
                <span className={styles.billingStateHint}>
                  {user.billing.state === "payg" && `${user.billing.walletCreditsUsed.toLocaleString()} credits paid from the wallet this cycle, after the plan allowance ran out.`}
                  {user.billing.state === "over_limit" && "Plan allowance used up and no usable wallet, so sending is paused until they top up or upgrade."}
                  {user.billing.state === "expired" && "Paid plan lapsed and no usable wallet."}
                  {user.billing.state === "plan" && "Within the plan allowance."}
                  {user.billing.state === "reseller" && "Billed from the reseller's credit pool through the wallet."}
                </span>
              </div>
              {billingLoading ? (
                <div className={styles.billingLoading}>Loading…</div>
              ) : billing ? (
                <div className={styles.modalGrid}>
                  {/* Summary row */}
                  <div className={styles.creditSummaryRow}>
                    <div className={styles.creditStat}>
                      <span className={styles.creditStatNum}>{billing.monthlyCreditsUsed.toLocaleString()}</span>
                      <span className={styles.creditStatLabel}>used</span>
                    </div>
                    <div className={styles.creditStat}>
                      <span className={styles.creditStatNum}>
                        {billing.creditLimit === -1 ? "∞" : billing.creditLimit.toLocaleString()}
                      </span>
                      <span className={styles.creditStatLabel}>limit</span>
                    </div>
                    <div className={styles.creditStat}>
                      <span className={`${styles.creditStatNum} ${creditPct >= 90 ? styles.textDanger : creditPct >= 75 ? styles.textWarning : ""}`}>
                        {billing.creditLimit === -1 ? "—" : `${creditPct}%`}
                      </span>
                      <span className={styles.creditStatLabel}>used %</span>
                    </div>
                    <div className={styles.creditStat}>
                      <span className={styles.creditStatNum}>{billing.totalCreditsUsed.toLocaleString()}</span>
                      <span className={styles.creditStatLabel}>all-time</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {billing.creditLimit !== -1 && (
                    <div className={styles.creditBarTrack}>
                      <div
                        className={`${styles.creditBarFill} ${creditPct >= 90 ? styles.danger : creditPct >= 75 ? styles.warning : ""}`}
                        style={{ width: `${creditPct}%` }}
                      />
                    </div>
                  )}

                  <div className={styles.breakdownGrid}>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>Text</span>
                      <span className={styles.breakdownVal}>{billing.monthlyBreakdown.text.toLocaleString()}</span>
                    </div>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>Image</span>
                      <span className={styles.breakdownVal}>{billing.monthlyBreakdown.image.toLocaleString()}</span>
                    </div>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>Voice</span>
                      <span className={styles.breakdownVal}>{billing.monthlyBreakdown.voice.toLocaleString()}</span>
                    </div>
                  </div>

                  {billing.sourceBreakdown.length > 0 && (
                    <div className={styles.agentBreakdownList}>
                      <div className={styles.sourceHeader}>
                        <span>Spent on</span>
                        <span>Credits</span>
                        <span>From wallet</span>
                      </div>
                      {billing.sourceBreakdown.map((s) => (
                        <div key={s.source} className={styles.sourceRow}>
                          <span className={styles.agentBreakdownName}>{SOURCE_LABELS[s.source] ?? s.source}</span>
                          <span className={styles.agentBreakdownNum}>{s.credits.toLocaleString()}</span>
                          <span className={styles.agentBreakdownNum}>{s.walletCredits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Per-agent breakdown */}
                  {billing.agentBreakdown.length > 0 && (
                    <div className={styles.agentBreakdownList}>
                      <div className={styles.agentBreakdownHeader}>
                        <span>Agent</span>
                        <span>Runtime</span>
                        <span>Conversations</span>
                        <span>Credits</span>
                      </div>
                      {billing.agentBreakdown.map((a) => (
                        <div key={a.id} className={styles.agentBreakdownRow}>
                          <span className={styles.agentBreakdownName}>{a.businessName}</span>
                          <span className={styles.agentBreakdownMeta}>
                            {a.runtime === "orchestrator" ? "AI" : "Voice"} · {a.transportType === "baileys" ? "WhatsApp Web" : "WABA"}
                          </span>
                          <span className={styles.agentBreakdownNum}>{a.conversationCount.toLocaleString()}</span>
                          <span className={styles.agentBreakdownNum}>{a.monthlyCredits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Overage alert */}
                  {billing.overageCredits > 0 && (
                    <div className={styles.overageAlert}>
                      <span className={styles.overageAlertTitle}>Over limit</span>
                      <span>{billing.overageCredits.toLocaleString()} credits over</span>
                      {billing.overageChargeNaira !== null && (
                        <span className={styles.overageCharge}>{formatNaira(billing.overageChargeNaira)} due</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.billingLoading}>Could not load billing data</div>
              )}
            </div>

            {/* ── Wallet credits (admin allocation, 12-month expiry) ── */}
            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>Adjust credits (12-month)</div>
              <p className={styles.sectionNote}>
                Add or remove a custom amount of the user&apos;s spendable credits. Adding tops up the balance and resets expiry to 12 months from today; removing corrects an over-grant and can&apos;t push the balance below zero.
              </p>
              {billing && (
                <div className={styles.walletLine}>
                  Current wallet: <strong>{billing.walletBalance.toLocaleString()}</strong> credits
                  {billing.walletExpiresAt
                    ? <> · expires {formatDate(billing.walletExpiresAt)}</>
                    : <> · no expiry set</>}
                </div>
              )}
              <div className={styles.inlineForm}>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="Amount of credits"
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  className={`${styles.agentLimitInput} ${styles.creditInput}`}
                  aria-label="Amount of credits"
                />
                <button className={styles.agentLimitSaveBtn} onClick={() => handleAllocate("add")} disabled={allocating}>
                  {allocating ? "Saving…" : "Add credits"}
                </button>
                <button
                  className={styles.agentLimitSaveBtn}
                  onClick={() => handleAllocate("deduct")}
                  disabled={allocating}
                  data-variant="danger"
                >
                  {allocating ? "Saving…" : "Reduce credits"}
                </button>
              </div>
              {allocMsg && (
                <div className={styles.allocMsg} role="status">{allocMsg}</div>
              )}
            </div>
          </>
        )}

        {/* ── Agents tab ── */}
        {tab === "agents" && (
          <div className={styles.modalSection}>
            <div className={styles.modalSectionTitle}>AI Agents & Messaging</div>
            {billingLoading ? (
              <div className={styles.billingLoading}>Loading…</div>
            ) : billing && billing.agents.length > 0 ? (
              <div className={styles.agentCardList}>
                {billing.agents.map((a) => {
                  const state = agentMessaging[a.id]
                  const enabled = state?.enabled ?? a.messagingEnabled
                  const saving = state?.saving ?? false
                  return (
                    <div key={a.id} className={`${styles.agentCard} ${!enabled ? styles.agentCardPaused : ""}`}>
                      <div className={styles.agentCardHeader}>
                        <div className={styles.agentCardMeta}>
                          <span className={enabled ? styles.activeBadge : styles.expiredBadge}>
                            {enabled ? "On" : "Off"}
                          </span>
                          <div>
                            <div className={styles.agentCardName}>{a.businessName}</div>
                            <div className={styles.agentCardPhone}>
                              {a.whatsappPhoneNumber
                                || (a.whatsappAgentLink ? a.whatsappAgentLink.replace("https://wa.me/", "+") : null)
                                || (a.whatsappPhoneNumberId ? `ID: ${a.whatsappPhoneNumberId}` : null)
                                || <span className={styles.muted}>No number linked</span>}
                            </div>
                          </div>
                        </div>
                        <label className={styles.toggleSwitch}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={saving}
                            onChange={(e) => handleToggleMessaging(a.id, e.target.checked)}
                          />
                          <span className={styles.toggleTrack} />
                        </label>
                      </div>
                      <div className={styles.agentCardHint}>
                        {enabled
                          ? "Active — responding to WhatsApp messages."
                          : "Paused — WhatsApp account is unlinked."}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className={styles.billingLoading}>No agents found for this user.</div>
            )}
          </div>
        )}

      </div>
    </Modal>
  )
}

const BILLING_FILTERS: UserBillingState[] = ["payg", "over_limit", "expired", "plan", "reseller"]
const STATUS_OPTIONS = ["PENDING", "APPROVED", "SUSPENDED", "REJECTED"]
const SORT_LABELS: Record<UserListQuery["sort"], string> = {
  newest: "Newest",
  credits: "Most credits used",
  wallet: "Biggest wallet",
  name: "Name",
}

function listHref(query: UserListQuery, overrides: Partial<UserListQuery>): string {
  // Any filter change sends you back to page 1 unless the page itself is the change.
  const next = { ...query, page: 1, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set("q", next.q)
  if (next.billing) params.set("billing", next.billing)
  if (next.plan) params.set("plan", next.plan)
  if (next.status) params.set("status", next.status)
  if (next.onboarding) params.set("onboarding", next.onboarding)
  if (next.sort !== "newest") params.set("sort", next.sort)
  if (next.page > 1) params.set("page", String(next.page))
  const qs = params.toString()
  return qs ? `/admin/users?${qs}` : "/admin/users"
}

function CreditsCell({ billing }: { billing: AdminUserRow["billing"] }) {
  if (billing.creditLimit === -1) {
    return <span className={styles.creditsUnlimited}>{billing.creditsUsed.toLocaleString()} · unlimited</span>
  }
  const pct = billing.creditLimit > 0 ? Math.min(100, Math.round((billing.creditsUsed / billing.creditLimit) * 100)) : 100
  return (
    <div className={styles.creditsCell}>
      <span className={styles.creditsNums}>
        {billing.creditsUsed.toLocaleString()}
        <span className={styles.creditsOf}> / {billing.creditLimit.toLocaleString()}</span>
      </span>
      <div className={styles.creditBarTrack} aria-hidden="true">
        <div
          className={`${styles.creditBarFill} ${pct >= 100 ? styles.danger : pct >= 75 ? styles.warning : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function UserTable({ users, query, total, matching, pageCount, stateCounts }: UserTableProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null)
  const [search, setSearch] = useState(query.q)

  const handleStatusChange = async (userId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") => {
    setLoading(`${userId}-${status}`)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("Failed to update")
      router.refresh()
      setSelectedUser(null)
      showToast(`User ${status.toLowerCase()}`)
    } catch {
      showToast("Couldn't update the user's status", "error")
    } finally {
      setLoading(null)
    }
  }

  const filtersActive = Boolean(query.q || query.billing || query.plan || query.status || query.onboarding)

  return (
    <>
      <div className={styles.chips} role="group" aria-label="Filter by billing state">
        <Link href={listHref(query, { billing: "" })} className={!query.billing ? styles.chipActive : styles.chip} aria-current={!query.billing ? "true" : undefined}>
          All <span className={styles.chipCount}>{total.toLocaleString()}</span>
        </Link>
        {BILLING_FILTERS.map((s) => (
          <Link
            key={s}
            href={listHref(query, { billing: query.billing === s ? "" : s })}
            className={query.billing === s ? styles.chipActive : styles.chip}
            aria-current={query.billing === s ? "true" : undefined}
          >
            {BILLING_STATE_LABELS[s]} <span className={styles.chipCount}>{stateCounts[s].toLocaleString()}</span>
          </Link>
        ))}
      </div>

      <div className={styles.wrapper}>
        <form
          className={styles.toolbar}
          onSubmit={(e) => {
            e.preventDefault()
            router.push(listHref(query, { q: search.trim() }))
          }}
        >
          <label className={styles.srOnly} htmlFor="user-search">Search users</label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, business or phone…"
            className={styles.searchInput}
            autoComplete="off"
            spellCheck={false}
          />
          <label className={styles.srOnly} htmlFor="user-plan">Plan</label>
          <select id="user-plan" className={styles.select} value={query.plan}
            onChange={(e) => router.push(listHref(query, { plan: e.target.value }))}>
            <option value="">All plans</option>
            {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_LABELS[p] ?? p}</option>)}
            <option value="reseller">Reseller</option>
          </select>
          <label className={styles.srOnly} htmlFor="user-status">Account status</label>
          <select id="user-status" className={styles.select} value={query.status}
            onChange={(e) => router.push(listHref(query, { status: e.target.value }))}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
          <label className={styles.srOnly} htmlFor="user-sort">Sort</label>
          <select id="user-sort" className={styles.select} value={query.sort}
            onChange={(e) => router.push(listHref(query, { sort: e.target.value as UserListQuery["sort"] }))}>
            {(Object.keys(SORT_LABELS) as UserListQuery["sort"][]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={query.onboarding === "incomplete"}
              onChange={(e) => router.push(listHref(query, { onboarding: e.target.checked ? "incomplete" : "" }))} />
            Onboarding incomplete
          </label>
          {filtersActive && (
            <Link href="/admin/users" className={styles.clearLink}>Clear filters</Link>
          )}
        </form>

        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th} scope="col">User</th>
              <th className={styles.th} scope="col">Business</th>
              <th className={styles.th} scope="col">Billing</th>
              <th className={styles.th} scope="col">Credits this cycle</th>
              <th className={`${styles.th} ${styles.num}`} scope="col">Wallet</th>
              <th className={`${styles.th} ${styles.num}`} scope="col">Agents</th>
              <th className={styles.th} scope="col">Status</th>
              <th className={styles.th} scope="col">Joined</th>
              <th className={styles.th} scope="col"><span className={styles.srOnly}>Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  {filtersActive ? "No users match these filters." : "No users yet."}
                </td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id} className={styles.tr}>
                <td className={styles.td}>
                  <button type="button" className={styles.rowButton} onClick={() => setSelectedUser(user)}>
                    <span className={styles.name}>{user.name}</span>
                    <span className={styles.email}>{user.email}</span>
                    {user.phone && <span className={styles.email}>{user.phone}</span>}
                  </button>
                  {!user.onboardingCompleted && <span className={styles.onboardingTag}>Onboarding</span>}
                </td>
                <td className={styles.td}>
                  <div className={styles.business}>{user.businessName}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.billingCell}>
                    <span className={styles.planBadge} data-plan={user.plan ?? "free"}>{PLAN_LABELS[user.plan ?? "free"] ?? user.plan}</span>
                    {user.billing.state !== "plan" && user.billing.state !== "reseller" && (
                      <span className={styles.stateBadge} data-state={user.billing.state}>{BILLING_STATE_LABELS[user.billing.state]}</span>
                    )}
                  </div>
                </td>
                <td className={styles.td}><CreditsCell billing={user.billing} /></td>
                <td className={`${styles.td} ${styles.num}`}>
                  {user.billing.walletBalance > 0
                    ? <span className={user.billing.walletUsable ? "" : styles.mutedStrike} title={user.billing.walletUsable ? undefined : "Expired"}>{user.billing.walletBalance.toLocaleString()}{!user.billing.walletUsable && <span className={styles.srOnly}> (expired)</span>}</span>
                    : <span className={styles.muted}>0</span>}
                </td>
                <td className={`${styles.td} ${styles.num}`}>{user.agentCount}</td>
                <td className={styles.td}><StatusBadge status={user.status} /></td>
                <td className={styles.td}><span className={styles.nowrap}>{formatDate(user.createdAt)}</span></td>
                <td className={styles.td}>
                  <div className={styles.actions}>
                    {(user.status === "PENDING" || user.status === "REJECTED" || user.status === "SUSPENDED") && (
                      <Button size="sm" variant="primary" loading={loading === `${user.id}-APPROVED`}
                        onClick={() => handleStatusChange(user.id, "APPROVED")}>
                        {user.status === "SUSPENDED" ? "Unsuspend" : "Approve"}
                      </Button>
                    )}
                    {user.status === "APPROVED" && (
                      <Button size="sm" variant="danger" loading={loading === `${user.id}-SUSPENDED`}
                        onClick={() => handleStatusChange(user.id, "SUSPENDED")}>
                        Suspend
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.pager}>
          <span className={styles.muted}>
            {matching === 0 ? "0 users" : `${((query.page - 1) * 50 + 1).toLocaleString()}-${Math.min(query.page * 50, matching).toLocaleString()} of ${matching.toLocaleString()}`}
          </span>
          <div className={styles.pagerLinks}>
            {query.page > 1
              ? <Link href={listHref(query, { page: query.page - 1 })} className={styles.pagerLink}>Previous</Link>
              : <span className={styles.pagerDisabled}>Previous</span>}
            <span className={styles.muted}>Page {query.page} of {pageCount}</span>
            {query.page < pageCount
              ? <Link href={listHref(query, { page: query.page + 1 })} className={styles.pagerLink}>Next</Link>
              : <span className={styles.pagerDisabled}>Next</span>}
          </div>
        </div>
      </div>

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onStatusChange={handleStatusChange}
          loading={loading}
        />
      )}
    </>
  )
}

export default UserTable
