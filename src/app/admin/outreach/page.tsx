import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { OutreachReview } from "@/components/admin/OutreachReview"
import { OUTREACH_APP_URL } from "@/lib/outreach/render"
import { WARMUP_DAYS } from "@/lib/outreach/warmup"
import { effectiveDailyCap, warmupStatus, isRootSender } from "@/lib/outreach/send"
import styles from "./page.module.css"

// The review queue. This is the page that gets used daily: everything else in
// the pipeline exists to fill it, and nothing reaches a mailbox without passing
// through it.

export const dynamic = "force-dynamic"

export default async function AdminOutreachPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const [drafts, counts, sentToday, complaints] = await Promise.all([
    db.outreachMessage.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: {
        id: true,
        subject: true,
        bodyText: true,
        aiReason: true,
        aiSignals: true,
        toEmail: true,
        step: true,
        createdAt: true,
        prospect: {
          select: {
            businessName: true,
            vertical: true,
            city: true,
            fitScore: true,
            sourceLabel: true,
            sourceUrl: true,
            demoSlug: true,
          },
        },
      },
    }),
    db.outreachProspect.groupBy({ by: ["status"], _count: { _all: true } }),
    db.outreachMessage.count({ where: { status: "sent", sentAt: { gte: startOfDay } } }),
    db.outreachSuppression.count({ where: { reason: "complained" } }),
  ])

  const approved = await db.outreachMessage.count({ where: { status: "approved" } })
  const warmup = warmupStatus()
  const cap = effectiveDailyCap()

  // Serialize before the client boundary — Dates never cross it as objects.
  const items = drafts.map((d) => ({
    id: d.id,
    subject: d.subject,
    bodyText: d.bodyText,
    aiReason: d.aiReason,
    signals: Array.isArray(d.aiSignals) ? (d.aiSignals as { claim: string; sourceUrl: string }[]) : [],
    toEmail: d.toEmail,
    step: d.step,
    createdAt: d.createdAt.toISOString(),
    businessName: d.prospect.businessName,
    vertical: d.prospect.vertical,
    city: d.prospect.city,
    fitScore: d.prospect.fitScore,
    sourceLabel: d.prospect.sourceLabel,
    sourceUrl: d.prospect.sourceUrl,
    demoUrl: d.prospect.demoSlug ? `${OUTREACH_APP_URL}/demo/${d.prospect.demoSlug}` : null,
  }))

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Outreach</h1>
          <p className={styles.subtitle}>
            Every email is reviewed here before it is sent. Nothing goes out automatically.
          </p>
        </div>
      </div>

      <div className={styles.stats}>
        <Stat label="Awaiting review" value={items.length} />
        <Stat label="Approved, not sent" value={approved} />
        <Stat label="Sent today" value={`${sentToday} / ${cap}`} />
        <Stat label="Prospects" value={Object.values(byStatus).reduce((a, b) => a + b, 0)} />
        <Stat label="Complaints" value={complaints} danger={complaints > 0} />
      </div>

      {!warmup.complete && (
        <p className={styles.warmup}>
          {warmup.configured
            ? `Warmup day ${warmup.day} of ${WARMUP_DAYS}. Today's ceiling is ${cap}, rising to ${warmup.fullCap} once the ramp finishes.`
            : `OUTREACH_WARMUP_STARTED_AT is not set, so sending is held at the day-one ceiling of ${cap}. Set it to the date you started sending from this address.`}
        </p>
      )}

      {isRootSender() && (
        <p className={styles.warmup}>
          Sending from dailzero.com itself, so this campaign shares a domain reputation with every
          verification code and password reset. Complaints here reach those. Check Google Postmaster
          Tools before scaling up, and keep the daily cap low.
        </p>
      )}

      {complaints > 0 && (
        <p className={styles.alert}>
          {complaints} spam complaint(s) recorded. Sending is blocked until this is reviewed.
          At pilot volume one complaint is already above the rate Gmail enforces.
        </p>
      )}

      <OutreachReview items={items} approved={approved} sentToday={sentToday} cap={cap} />
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <div className={styles.stat}>
      <span className={danger ? styles.statValueDanger : styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}
