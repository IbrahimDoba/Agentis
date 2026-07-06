"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import styles from "./UserTable.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { formatDate } from "@/lib/utils"
import { formatNaira } from "@/lib/plans"
import type { UserPublic } from "@/types"

interface UserWithAgentCount extends UserPublic {
  _count?: { agents: number }
}

interface UserTableProps {
  users: UserWithAgentCount[]
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

type ModalTab = "account" | "subscription" | "agents"

function UserDetailModal({ user, onClose, onStatusChange, loading }: {
  user: UserWithAgentCount
  onClose: () => void
  onStatusChange: (userId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") => void
  loading: string | null
}) {
  const router = useRouter()
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
      alert("Failed to update messaging status")
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
    } catch { alert("Failed to update agent limit") }
    finally { setSavingMaxAgents(false) }
  }

  const handleSavePlan = async () => {
    setSavingPlan(true)
    try {
      await patch({ plan })
      setPlanSaved(true)
      setTimeout(() => setPlanSaved(false), 2000)
    } catch { alert("Failed to update plan") }
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
    } catch { alert("Failed to update subscription expiry") }
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
      alert("Failed to reset usage")
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
      <div className={styles.tabBar}>
        <button className={tab === "account" ? styles.tabActive : styles.tabBtn} onClick={() => setTab("account")}>
          Account
        </button>
        <button className={tab === "subscription" ? styles.tabActive : styles.tabBtn} onClick={() => setTab("subscription")}>
          Subscription
          {billing && creditPct >= 75 && (
            <span className={styles.tabBadgeDanger}>{creditPct}%</span>
          )}
        </button>
        <button className={tab === "agents" ? styles.tabActive : styles.tabBtn} onClick={() => setTab("agents")}>
          Agents
          {agentCount > 0 && (
            <span className={pausedCount > 0 ? styles.tabBadgeDanger : styles.tabBadge}>{agentCount}</span>
          )}
        </button>
      </div>

      <div className={styles.modalBody} style={{ marginTop: "1.25rem" }}>

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
                      <select value={plan} onChange={(e) => setPlan(e.target.value)} className={styles.agentLimitInput}>
                        <option value="free">Free</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
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
              <div className={styles.modalSectionTitle}>Credits — This Month</div>
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
                    <div className={styles.creditBarTrack} style={{ marginTop: "0.25rem" }}>
                      <div
                        className={`${styles.creditBarFill} ${creditPct >= 90 ? styles.danger : creditPct >= 75 ? styles.warning : ""}`}
                        style={{ width: `${creditPct}%` }}
                      />
                    </div>
                  )}

                  {/* Breakdown by type */}
                  <div className={styles.breakdownGrid}>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>💬 Text AI</span>
                      <span className={styles.breakdownVal}>{billing.monthlyBreakdown.text.toLocaleString()}</span>
                    </div>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>🖼 Image AI</span>
                      <span className={styles.breakdownVal}>{billing.monthlyBreakdown.image.toLocaleString()}</span>
                    </div>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>🎙 Voice</span>
                      <span className={styles.breakdownVal}>{billing.monthlyBreakdown.voice.toLocaleString()}</span>
                    </div>
                  </div>

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
              <p style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", margin: "0 0 10px" }}>
                Add or remove a custom amount of the user&apos;s spendable credits. Adding tops up the balance and resets expiry to 12 months from today; removing corrects an over-grant and can&apos;t push the balance below zero.
              </p>
              {billing && (
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  Current wallet: <strong>{billing.walletBalance.toLocaleString()}</strong> credits
                  {billing.walletExpiresAt
                    ? <> · expires {formatDate(billing.walletExpiresAt)}</>
                    : <> · no expiry set</>}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="Amount of credits"
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  className={styles.agentLimitInput}
                  style={{ width: 170 }}
                />
                <button className={styles.agentLimitSaveBtn} onClick={() => handleAllocate("add")} disabled={allocating}>
                  {allocating ? "Saving…" : "Add credits"}
                </button>
                <button
                  className={styles.agentLimitSaveBtn}
                  onClick={() => handleAllocate("deduct")}
                  disabled={allocating}
                  style={{ background: "var(--danger-bg, #fee2e2)", color: "var(--danger-text, #b91c1c)" }}
                >
                  {allocating ? "Saving…" : "Reduce credits"}
                </button>
              </div>
              {allocMsg && (
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: "var(--text-primary, #18181b)" }}>{allocMsg}</div>
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
                                || <span style={{ color: "var(--text-muted)" }}>No number linked</span>}
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

export function UserTable({ users }: UserTableProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserWithAgentCount | null>(null)
  const [search, setSearch] = useState("")

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
    } catch {
      alert("Failed to update user status")
    } finally {
      setLoading(null)
    }
  }

  if (users.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>No users found</div>
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? users.filter((u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.businessName ?? "").toLowerCase().includes(q)
      )
    : users

  return (
    <>
      <div className={styles.wrapper}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border-subtle, #e4e4e7)", flexWrap: "wrap" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{ flex: 1, minWidth: 220, border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "var(--bg-primary, #fff)", color: "inherit" }}
          />
          {q && <span style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)" }}>{filtered.length} of {users.length}</span>}
        </div>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>User</th>
              <th className={styles.th}>Business</th>
              <th className={styles.th}>Phone</th>
              <th className={styles.th}>Agents</th>
              <th className={styles.th}>Plan</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Joined</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-secondary, #6b7280)" }}>
                  No users match &quot;{search}&quot;
                </td>
              </tr>
            ) : filtered.map((user) => (
              <tr
                key={user.id}
                className={styles.tr}
                onClick={() => setSelectedUser(user)}
                style={{ cursor: "pointer" }}
              >
                <td className={styles.td}>
                  <div className={styles.name}>
                    {user.name}
                    {!user.onboardingCompleted && (
                      <span title="Onboarding not completed" style={{ marginLeft: "0.4rem", fontSize: "10px", background: "var(--warning-light)", color: "var(--warning)", borderRadius: "4px", padding: "1px 5px", fontWeight: 600, verticalAlign: "middle" }}>
                        onboarding
                      </span>
                    )}
                  </div>
                  <div className={styles.email}>{user.email}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.business}>{user.businessName}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.business}>{user.phone ?? "—"}</div>
                </td>
                <td className={styles.td}>
                  {(user as any)._count?.agents ?? 0}
                </td>
                <td className={styles.td}>
                  <span className={styles.planBadge} data-plan={user.plan ?? "free"}>
                    {(user.plan ?? "free").charAt(0).toUpperCase() + (user.plan ?? "free").slice(1)}
                  </span>
                </td>
                <td className={styles.td}>
                  <StatusBadge status={user.status} />
                </td>
                <td className={styles.td}>
                  {formatDate(user.createdAt)}
                </td>
                <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.actions}>
                    {(user.status === "PENDING" || user.status === "REJECTED" || user.status === "SUSPENDED") && (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={loading === `${user.id}-APPROVED`}
                        onClick={() => handleStatusChange(user.id, "APPROVED")}
                      >
                        {user.status === "SUSPENDED" ? "Unsuspend" : "Approve"}
                      </Button>
                    )}
                    {user.status === "APPROVED" && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={loading === `${user.id}-SUSPENDED`}
                        onClick={() => handleStatusChange(user.id, "SUSPENDED")}
                      >
                        Suspend
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
