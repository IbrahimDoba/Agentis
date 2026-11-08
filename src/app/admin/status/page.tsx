import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { formatDate } from "@/lib/utils"
import styles from "./page.module.css"

const RANGES = [7, 30, 90] as const
// A scheduled post this far past its slot is stuck, not just queued behind others.
const STUCK_AFTER_MS = 15 * 60 * 1000

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function rate(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "-"
}

export default async function AdminStatusPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const sp = await searchParams
  const daysParam = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days)
  const days = (RANGES as readonly number[]).includes(daysParam) ? daysParam : 30
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS)

  const [totals, funnel, credits, queue, topUsers, errors, failures, runs, savedInRange] = await Promise.all([
    db.$queryRawUnsafe<Array<{ posted: number; failed: number; reach: number; users: number }>>(
      `SELECT COUNT(*) FILTER (WHERE sp.status = 'posted')::int AS posted,
              COUNT(*) FILTER (WHERE sp.status = 'failed')::int AS failed,
              COALESCE(SUM(sp."recipientCount") FILTER (WHERE sp.status = 'posted'), 0)::int AS reach,
              COUNT(DISTINCT a."userId") FILTER (WHERE sp.status = 'posted')::int AS users
       FROM "StatusPost" sp JOIN "Agent" a ON a.id = sp."agentId"
       WHERE sp."scheduledAt" >= $1::timestamptz`,
      since.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ delivered: number; viewed: number; liked: number; replied: number }>>(
      `SELECT COUNT(sv."deliveredAt")::int AS delivered,
              COUNT(sv."viewedAt")::int AS viewed,
              COUNT(sv."likedAt")::int AS liked,
              COUNT(sv."repliedAt")::int AS replied
       FROM "StatusView" sv JOIN "StatusPost" sp ON sp.id = sv."postId"
       WHERE sp."postedAt" >= $1::timestamptz`,
      since.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ source: string; total: number; wallet: number }>>(
      `SELECT "source", COALESCE(SUM("creditsUsed"), 0)::int AS total,
              COALESCE(SUM("creditsUsed") FILTER (WHERE "billedTo" = 'wallet'), 0)::int AS wallet
       FROM "CreditUsage"
       WHERE "source" IN ('status', 'contact_save') AND "createdAt" >= $1::timestamptz
       GROUP BY "source"`,
      since.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ upcoming: number; stuck: number }>>(
      `SELECT COUNT(*) FILTER (WHERE "scheduledAt" >= $1::timestamptz)::int AS upcoming,
              COUNT(*) FILTER (WHERE "scheduledAt" < $1::timestamptz)::int AS stuck
       FROM "StatusPost" WHERE status IN ('scheduled', 'posting')`,
      stuckBefore.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ id: string; name: string; email: string; businessName: string; posts: number; reach: number; viewed: number; credits: number }>>(
      `SELECT u.id, u.name, u.email, u."businessName",
              COUNT(sp.id)::int AS posts,
              COALESCE(SUM(sp."recipientCount"), 0)::int AS reach,
              COALESCE(SUM(v.viewed), 0)::int AS viewed,
              COALESCE(SUM(sp."creditsUsed"), 0)::int AS credits
       FROM "StatusPost" sp
       JOIN "Agent" a ON a.id = sp."agentId"
       JOIN "User" u ON u.id = a."userId"
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS viewed FROM "StatusView"
         WHERE "postId" = sp.id AND "viewedAt" IS NOT NULL
       ) v ON true
       WHERE sp.status = 'posted' AND sp."postedAt" >= $1::timestamptz
       GROUP BY u.id
       ORDER BY posts DESC, reach DESC
       LIMIT 15`,
      since.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ error: string; count: number }>>(
      `SELECT COALESCE(NULLIF(LEFT(error, 120), ''), 'No error recorded') AS error, COUNT(*)::int AS count
       FROM "StatusPost"
       WHERE status = 'failed' AND "scheduledAt" >= $1::timestamptz
       GROUP BY 1 ORDER BY count DESC LIMIT 6`,
      since.toISOString()
    ),
    db.statusPost.findMany({
      where: { status: "failed", scheduledAt: { gte: since } },
      orderBy: { scheduledAt: "desc" },
      take: 10,
      select: {
        id: true,
        kind: true,
        error: true,
        scheduledAt: true,
        agent: { select: { businessName: true, user: { select: { email: true } } } },
      },
    }),
    db.contactSaveRun.findMany({
      where: { status: { in: ["running", "paused"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        status: true,
        pauseReason: true,
        totalCount: true,
        savedCount: true,
        failedCount: true,
        createdAt: true,
        agent: { select: { businessName: true, user: { select: { email: true } } } },
      },
    }),
    db.contactSaveRun.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { savedCount: true, failedCount: true },
      _count: { _all: true },
    }),
  ])

  const t = totals[0] ?? { posted: 0, failed: 0, reach: 0, users: 0 }
  const f = funnel[0] ?? { delivered: 0, viewed: 0, liked: 0, replied: 0 }
  const q = queue[0] ?? { upcoming: 0, stuck: 0 }
  const statusCredits = credits.find((c) => c.source === "status")
  const contactCredits = credits.find((c) => c.source === "contact_save")

  const kpis = [
    { label: "Posts published", value: t.posted.toLocaleString(), sub: `${t.users.toLocaleString()} users posting` },
    { label: "Sent to", value: t.reach.toLocaleString(), sub: `${t.posted > 0 ? Math.round(t.reach / t.posted).toLocaleString() : 0} per post` },
    { label: "Viewed", value: f.viewed.toLocaleString(), sub: `${rate(f.viewed, t.reach)} view rate` },
    { label: "Likes and replies", value: (f.liked + f.replied).toLocaleString(), sub: `${f.liked.toLocaleString()} likes · ${f.replied.toLocaleString()} replies` },
    { label: "Failed", value: t.failed.toLocaleString(), sub: `${rate(t.failed, t.posted + t.failed)} of attempts`, tone: t.failed > 0 ? "bad" : undefined },
    { label: "Credits on Status", value: Number(statusCredits?.total ?? 0).toLocaleString(), sub: `${Number(statusCredits?.wallet ?? 0).toLocaleString()} from wallets` },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Status</h1>
          <p className={styles.subtitle}>WhatsApp Status posting across all users, last {days} days</p>
        </div>
        <nav className={styles.range} aria-label="Date range">
          {RANGES.map((r) => (
            <Link key={r} href={r === 30 ? "/admin/status" : `/admin/status?days=${r}`}
              className={r === days ? styles.rangeActive : styles.rangeLink}
              aria-current={r === days ? "page" : undefined}>
              {r} days
            </Link>
          ))}
        </nav>
      </div>

      <div className={styles.kpis}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.kpi}>
            <span className={styles.kpiLabel}>{k.label}</span>
            <span className={styles.kpiValue} data-tone={k.tone}>{k.value}</span>
            <span className={styles.kpiSub}>{k.sub}</span>
          </div>
        ))}
      </div>

      <div className={styles.funnelCard}>
        <h2 className={styles.cardTitle}>Viewer funnel</h2>
        <div className={styles.funnel}>
          {[
            { label: "Sent to", value: t.reach },
            { label: "Delivered", value: f.delivered },
            { label: "Viewed", value: f.viewed },
            { label: "Liked", value: f.liked },
            { label: "Replied", value: f.replied },
          ].map((step) => (
            <div key={step.label} className={styles.funnelStep}>
              <div className={styles.funnelHead}>
                <span>{step.label}</span>
                <span className={styles.funnelNum}>{step.value.toLocaleString()} <span className={styles.muted}>{rate(step.value, t.reach)}</span></span>
              </div>
              <div className={styles.funnelTrack} aria-hidden="true">
                <div className={styles.funnelFill} style={{ width: t.reach > 0 ? `${Math.min(100, (step.value / t.reach) * 100)}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
        <p className={styles.note}>Views are undercounted when viewers have read receipts turned off.</p>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Top users</h2>
          {topUsers.length === 0 ? (
            <p className={styles.empty}>No posts published in this range.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col" className={styles.num}>Posts</th>
                  <th scope="col" className={styles.num}>Sent to</th>
                  <th scope="col" className={styles.num}>View rate</th>
                  <th scope="col" className={styles.num}>Credits</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/users?q=${encodeURIComponent(u.email)}`} className={styles.userLink}>{u.businessName || u.name}</Link>
                      <span className={styles.subLine}>{u.email}</span>
                    </td>
                    <td className={styles.num}>{u.posts.toLocaleString()}</td>
                    <td className={styles.num}>{u.reach.toLocaleString()}</td>
                    <td className={styles.num}>{rate(u.viewed, u.reach)}</td>
                    <td className={styles.num}>{u.credits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Queue and contacts</h2>
          <dl className={styles.facts}>
            <div><dt>Scheduled, upcoming</dt><dd>{q.upcoming.toLocaleString()}</dd></div>
            <div><dt>Stuck past their slot</dt><dd data-tone={q.stuck > 0 ? "bad" : undefined}>{q.stuck.toLocaleString()}</dd></div>
            <div><dt>Contact-save runs started</dt><dd>{savedInRange._count._all.toLocaleString()}</dd></div>
            <div><dt>Contacts saved</dt><dd>{Number(savedInRange._sum.savedCount ?? 0).toLocaleString()}</dd></div>
            <div><dt>Contact saves failed</dt><dd>{Number(savedInRange._sum.failedCount ?? 0).toLocaleString()}</dd></div>
            <div><dt>Credits on contact saving</dt><dd>{Number(contactCredits?.total ?? 0).toLocaleString()}</dd></div>
          </dl>

          <h3 className={styles.subTitle}>Active contact-save runs</h3>
          {runs.length === 0 ? (
            <p className={styles.empty}>None running.</p>
          ) : (
            <ul className={styles.rows}>
              {runs.map((r) => (
                <li key={r.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{r.agent.businessName}</span>
                    <span className={styles.subLine}>
                      {r.savedCount.toLocaleString()} of {r.totalCount.toLocaleString()} saved · started {formatDate(r.createdAt.toISOString())}
                    </span>
                  </div>
                  <span className={styles.pill} data-tone={r.status === "paused" ? "warn" : "good"}>
                    {r.status === "paused" && r.pauseReason ? `paused: ${r.pauseReason.replace("_", " ")}` : r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Why posts failed</h2>
          {errors.length === 0 ? (
            <p className={styles.empty}>No failures in this range.</p>
          ) : (
            <ul className={styles.rows}>
              {errors.map((e) => (
                <li key={e.error} className={styles.row}>
                  <span className={styles.errorText}>{e.error}</span>
                  <span className={styles.num}>{e.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Recent failures</h2>
          {failures.length === 0 ? (
            <p className={styles.empty}>No failures in this range.</p>
          ) : (
            <ul className={styles.rows}>
              {failures.map((p) => (
                <li key={p.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{p.agent.businessName}</span>
                    <span className={styles.subLine}>
                      {formatDate(p.scheduledAt.toISOString())} · {p.kind} · {p.agent.user.email}
                    </span>
                    {p.error && <span className={styles.errorText}>{p.error}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
