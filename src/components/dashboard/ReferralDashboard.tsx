"use client"

import { useState, useEffect } from "react"
import styles from "./ReferralDashboard.module.css"
import { formatDate } from "@/lib/utils"
import { formatNaira } from "@/lib/plans"

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  REWARDED: "Paid Out",
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--warning)",
  COMPLETED: "var(--accent)",
  REWARDED: "var(--teal)",
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
}

interface Referral {
  id: string
  referredName: string
  referredEmail: string
  referredPlan: string
  referredStatus: string
  status: string
  commissionEarned: number | null
  rewardGranted: boolean
  assignedByAdmin: boolean
  createdAt: string
}

interface Props {
  referralCode: string
  referrals: Referral[]
  stats: { totalEarned: number; totalPaid: number; pending: number; count: number }
}

export function ReferralDashboard({ referralCode, referrals, stats }: Props) {
  const [copied, setCopied] = useState(false)
  const [referralLink, setReferralLink] = useState(`https://dailzero.com/signup?ref=${referralCode}`)

  useEffect(() => {
    setReferralLink(`${window.location.origin}/signup?ref=${referralCode}`)
  }, [referralCode])

  function copyLink() {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Referrals</h1>
        <p className={styles.subtitle}>Earn 15% commission for every paying customer you refer</p>
      </div>

      {/* Referral link card */}
      <div className={styles.linkCard}>
        <div className={styles.linkCardLeft}>
          <p className={styles.linkLabel}>Your referral link</p>
          <p className={styles.linkUrl}>{referralLink}</p>
          <p className={styles.linkHint}>Share this link. When someone signs up and subscribes to a paid plan, you earn 15% commission.</p>
        </div>
        <button className={styles.copyBtn} onClick={copyLink}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy Link
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Referrals</span>
          <span className={styles.statNum}>{stats.count}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Earned</span>
          <span className={styles.statNum} style={{ color: "var(--accent)" }}>
            {stats.totalEarned > 0 ? formatNaira(stats.totalEarned) : "₦0"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending Payout</span>
          <span className={styles.statNum} style={{ color: "var(--warning)" }}>
            {stats.pending > 0 ? formatNaira(stats.pending) : "₦0"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Paid Out</span>
          <span className={styles.statNum} style={{ color: "var(--teal)" }}>
            {stats.totalPaid > 0 ? formatNaira(stats.totalPaid) : "₦0"}
          </span>
        </div>
      </div>

      {/* Commission rates info */}
      <div className={styles.ratesCard}>
        <p className={styles.ratesTitle}>Commission rates</p>
        <div className={styles.ratesGrid}>
          <div className={styles.rateItem}><span className={styles.ratePlan}>Starter</span><span className={styles.rateAmount}>₦7,500 / referral</span></div>
          <div className={styles.rateItem}><span className={styles.ratePlan}>Pro</span><span className={styles.rateAmount}>₦12,750 / referral</span></div>
          <div className={styles.rateItem}><span className={styles.ratePlan}>Enterprise</span><span className={styles.rateAmount}>Custom</span></div>
        </div>
      </div>

      {/* Referrals table */}
      <div className={styles.tableSection}>
        <h2 className={styles.sectionTitle}>Your Referrals</h2>
        {referrals.length === 0 ? (
          <div className={styles.empty}>
            <p>No referrals yet. Share your link to start earning.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>User</th>
                  <th className={styles.th}>Plan</th>
                  <th className={styles.th}>Commission</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.userName}>{r.referredName}</div>
                      <div className={styles.userEmail}>{r.referredEmail}</div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.plan}>{PLAN_LABELS[r.referredPlan] ?? r.referredPlan}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.commission}>
                        {r.commissionEarned != null ? formatNaira(r.commissionEarned) : "—"}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.statusPill} style={{ color: STATUS_COLORS[r.status], background: `${STATUS_COLORS[r.status]}18` }}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.date}>{formatDate(r.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className={styles.payoutNote}>
        💬 Payouts are processed manually. Once your commission is marked as &quot;Paid Out&quot;, our team will reach out to arrange the transfer.
      </p>
    </div>
  )
}
