import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"

interface Params { params: Promise<{ id: string }> }

// A reseller admin viewing one of her customers: profile + their agents
// (each links to a scoped agent editor). Strictly scoped to her tenant.
export default async function ResellerCustomerPage({ params }: Params) {
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role
  if (role !== "RESELLER_ADMIN" && role !== "ADMIN") redirect("/dashboard")
  const resellerId = session.user.resellerId
  const { id } = await params

  const customer = await db.user.findFirst({
    where: { id, resellerId },
    select: {
      id: true, name: true, email: true, businessName: true, phone: true, role: true,
      status: true, plan: true, creditBalance: true, creditsExpireAt: true,
      subscriptionExpiresAt: true, createdAt: true,
      agents: {
        select: { id: true, businessName: true, status: true, agentRuntime: true, messagingEnabled: true, whatsappPhoneNumber: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!customer) notFound()

  const card: React.CSSProperties = { border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 18, background: "var(--bg-secondary, #fff)" }
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—")
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13, borderBottom: "1px solid var(--border, #f0f0f0)" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
      <Link href="/reseller/users" style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", textDecoration: "none" }}>← All customers</Link>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{customer.businessName || customer.name}</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>{customer.email}{customer.role === "RESELLER_ADMIN" ? " · admin" : ""}</p>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Account</div>
        <div style={row}><span style={{ color: "var(--text-secondary, #71717a)" }}>Status</span><span style={{ fontWeight: 600 }}>{customer.status}</span></div>
        <div style={row}><span style={{ color: "var(--text-secondary, #71717a)" }}>Name</span><span>{customer.name}</span></div>
        <div style={row}><span style={{ color: "var(--text-secondary, #71717a)" }}>Phone</span><span>{customer.phone || "—"}</span></div>
        <div style={row}><span style={{ color: "var(--text-secondary, #71717a)" }}>Credits remaining</span><span style={{ fontWeight: 600 }}>{customer.creditBalance.toLocaleString()}</span></div>
        <div style={row}><span style={{ color: "var(--text-secondary, #71717a)" }}>Plan valid until</span><span>{fmt(customer.subscriptionExpiresAt)}</span></div>
        <div style={{ ...row, borderBottom: "none" }}><span style={{ color: "var(--text-secondary, #71717a)" }}>Joined</span><span>{fmt(customer.createdAt)}</span></div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "4px 0 10px" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Agents ({customer.agents.length})</div>
          <Link
            href={`/reseller/users/${customer.id}/agents/new`}
            style={{ fontSize: 13, fontWeight: 700, textDecoration: "none", color: "#fff", background: "var(--accent, #16a34a)", borderRadius: 8, padding: "8px 14px" }}
          >
            + Add agent
          </Link>
        </div>
        {customer.agents.length === 0 ? (
          <p style={{ color: "var(--text-secondary, #71717a)", fontSize: 14 }}>This customer hasn&apos;t set up an agent yet — click <strong>Add agent</strong> to create one for them.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {customer.agents.map((a) => (
              <Link key={a.id} href={`/reseller/agents/${a.id}`} style={{ ...card, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{a.businessName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary, #71717a)", marginTop: 2 }}>
                    {a.status} · {a.messagingEnabled ? "messaging on" : "messaging off"}{a.whatsappPhoneNumber ? ` · ${a.whatsappPhoneNumber}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent, #16a34a)" }}>Edit →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
