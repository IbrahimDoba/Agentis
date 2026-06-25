import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Reseller overview — pool balance + tenant counts. Server-rendered, scoped to
// the admin's own resellerId.
export default async function ResellerOverviewPage() {
  const session = await auth()
  const resellerId = session!.user.resellerId

  const [reseller, userCount, activeUsers, pendingUsers, planCount] = await Promise.all([
    db.reseller.findUnique({
      where: { id: resellerId },
      select: { name: true, appName: true, domain: true, creditPool: true, creditPoolTotal: true },
    }),
    db.user.count({ where: { resellerId } }),
    db.user.count({ where: { resellerId, status: "APPROVED" } }),
    db.user.count({ where: { resellerId, status: "PENDING" } }),
    db.resellerPlan.count({ where: { resellerId } }),
  ])

  const pool = reseller?.creditPool ?? 0
  const poolTotal = reseller?.creditPoolTotal ?? 0
  const used = Math.max(0, poolTotal - pool)
  const pct = poolTotal > 0 ? Math.round((pool / poolTotal) * 100) : 0

  const card: React.CSSProperties = {
    border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: "18px 20px",
    background: "var(--bg-secondary, #fff)",
  }
  const stat: React.CSSProperties = { fontSize: 28, fontWeight: 800, lineHeight: 1.1 }
  const label: React.CSSProperties = { fontSize: 13, color: "var(--text-secondary, #71717a)", marginTop: 4 }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Overview</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          {reseller?.appName} · {reseller?.domain}
        </p>
      </div>

      {/* Credit pool */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={stat}>{pool.toLocaleString()} <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary, #71717a)" }}>credits left</span></div>
            <div style={label}>Allocated lifetime: {poolTotal.toLocaleString()} · Granted out: {used.toLocaleString()}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: pct < 15 ? "#dc2626" : "var(--accent, #16a34a)" }}>{pct}% remaining</div>
        </div>
        <div style={{ marginTop: 14, height: 8, borderRadius: 999, background: "var(--border, #e4e4e7)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct < 15 ? "#dc2626" : "var(--accent, #16a34a)" }} />
        </div>
        {pool <= 0 && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#dc2626" }}>
            Your pool is empty — new activations are blocked until Dailzero tops it up.
          </p>
        )}
      </div>

      {/* Counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <div style={card}><div style={stat}>{userCount}</div><div style={label}>Total customers</div></div>
        <div style={card}><div style={stat}>{activeUsers}</div><div style={label}>Active</div></div>
        <div style={card}><div style={stat}>{pendingUsers}</div><div style={label}>Pending approval</div></div>
        <div style={card}><div style={stat}>{planCount}</div><div style={label}>Plans</div></div>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", margin: 0 }}>
        You collect payment from your customers your own way, then activate their plan from <strong>Customers</strong>.
        Each activation draws credits from your pool. Nothing is charged through Dailzero on your customers&apos; behalf.
      </p>
    </div>
  )
}
