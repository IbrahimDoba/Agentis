import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { PLATFORM_RESELLER_ID } from "@/lib/tenant"
import ResellerProfileEditor from "@/components/admin/ResellerProfileEditor"

interface Params { params: Promise<{ id: string }> }

// Super-admin view of ONE reseller: her pool + every customer with their real
// usage (agents, contacts = conversations, AI-sent messages, leads, credits).
export default async function AdminResellerDetailPage({ params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")
  const { id } = await params

  const reseller = await db.reseller.findUnique({ where: { id } })
  if (!reseller) notFound()

  const users = await db.user.findMany({
    where: { resellerId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, businessName: true, role: true, status: true,
      plan: true, creditBalance: true, creditsExpireAt: true, subscriptionExpiresAt: true, createdAt: true,
      _count: { select: { agents: true, leads: true } },
      agents: { select: { _count: { select: { conversations: true } } } },
    },
  })

  // AI-sent messages per user (outbound, sender = ai), scoped to this reseller.
  const aiRows = await db.$queryRawUnsafe<Array<{ userId: string; total: number }>>(
    `SELECT a."userId", COUNT(*)::int as total
     FROM "Message" m
     JOIN "Conversation" c ON m."conversationId" = c."id"
     JOIN "Agent" a ON c."agentId" = a."id"
     JOIN "User" u ON a."userId" = u."id"
     WHERE u."resellerId" = $1 AND m."direction" = 'outbound' AND m."senderRole" = 'ai'
     GROUP BY a."userId"`,
    id,
  )
  const aiMap: Record<string, number> = {}
  for (const r of aiRows) aiMap[r.userId] = Number(r.total)

  const pct = reseller.creditPoolTotal > 0 ? Math.round((reseller.creditPool / reseller.creditPoolTotal) * 100) : 0
  const cell: React.CSSProperties = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--border, #f0f0f0)", whiteSpace: "nowrap" }
  const fmt = (s: Date | null) => (s ? new Date(s).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "8px 4px" }}>
      <Link href="/admin/resellers" style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", textDecoration: "none" }}>← All resellers</Link>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{reseller.appName}</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          {reseller.domain} · {reseller.creditPool.toLocaleString()} / {reseller.creditPoolTotal.toLocaleString()} pool credits ({pct}%) · {users.length} customers
        </p>
      </div>

      <ResellerProfileEditor
        isPlatform={reseller.id === PLATFORM_RESELLER_ID}
        reseller={{
          id: reseller.id,
          name: reseller.name,
          appName: reseller.appName,
          domain: reseller.domain,
          domainAliases: reseller.domainAliases,
          primaryColor: reseller.primaryColor,
          supportEmail: reseller.supportEmail,
          supportWhatsapp: reseller.supportWhatsapp,
          logoUrl: reseller.logoUrl,
          status: reseller.status,
        }}
      />

      <div style={{ overflowX: "auto", border: "1px solid var(--border, #e4e4e7)", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "var(--bg-primary, #fafafa)" }}>
              {["Customer", "Status", "Plan", "Agents", "Contacts", "AI sent", "Leads", "Credits left", "Joined"].map((h) => (
                <th key={h} style={{ ...cell, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const contacts = u.agents.reduce((s, a) => s + a._count.conversations, 0)
              return (
                <tr key={u.id}>
                  <td style={cell}>
                    <div style={{ fontWeight: 700 }}>{u.businessName || u.name}</div>
                    <div style={{ color: "var(--text-secondary, #71717a)" }}>{u.email}{u.role === "RESELLER_ADMIN" ? " · admin" : ""}</div>
                  </td>
                  <td style={cell}>{u.status}</td>
                  <td style={cell}>{u.plan}</td>
                  <td style={cell}>{u._count.agents}</td>
                  <td style={cell}>{contacts.toLocaleString()}</td>
                  <td style={cell}>{(aiMap[u.id] ?? 0).toLocaleString()}</td>
                  <td style={cell}>{u._count.leads}</td>
                  <td style={cell}>{u.creditBalance.toLocaleString()}</td>
                  <td style={cell}>{fmt(u.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", margin: 0 }}>
        To add or configure a customer&apos;s AI agent, use <Link href="/admin/agents" style={{ color: "var(--accent, #16a34a)" }}>Agents</Link> — it manages every tenant&apos;s agents.
        Credits here are each customer&apos;s remaining balance (drawn from this reseller&apos;s pool when their plan was activated).
      </p>
    </div>
  )
}
