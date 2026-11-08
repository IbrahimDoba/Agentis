import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { UserTable, type AdminUserRow, type UserListQuery } from "@/components/admin/UserTable"
import { BILLING_USER_SELECT, getCycleBillingForUsers } from "@/lib/adminUserUsage"
import { hasUsableWallet } from "@/lib/walletStatus"
import type { UserBillingState } from "@/lib/userBillingState"

const PAGE_SIZE = 50
const BILLING_STATES: UserBillingState[] = ["payg", "over_limit", "expired", "plan", "reseller"]
const SORTS = ["newest", "credits", "wallet", "name"] as const

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ""
}

function parseQuery(sp: Record<string, string | string[] | undefined>): UserListQuery {
  const billing = one(sp.billing) as UserBillingState
  const sort = one(sp.sort) as UserListQuery["sort"]
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1))
  return {
    q: one(sp.q).trim(),
    billing: BILLING_STATES.includes(billing) ? billing : "",
    plan: one(sp.plan),
    status: one(sp.status),
    onboarding: one(sp.onboarding) === "incomplete" ? "incomplete" : "",
    sort: SORTS.includes(sort) ? sort : "newest",
    page,
  }
}

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const query = parseQuery(await searchParams)

  // Billing state is derived from usage, so it can't be a SQL WHERE. Every user
  // is loaded with lean columns, filtered here, and only one page crosses to
  // the client.
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      ...BILLING_USER_SELECT,
      name: true,
      email: true,
      phone: true,
      referralSource: true,
      businessName: true,
      role: true,
      status: true,
      resellerId: true,
      createdAt: true,
      businessCategory: true,
      businessDescription: true,
      businessAddress: true,
      businessEmail: true,
      businessWebsite: true,
      maxAgents: true,
      onboardingCompleted: true,
      _count: { select: { agents: true } },
    },
  })

  const billing = await getCycleBillingForUsers(users)
  const now = new Date()

  const rows: AdminUserRow[] = users.map((u) => {
    const b = billing.get(u.id)!
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ?? null,
      referralSource: u.referralSource ?? null,
      businessName: u.businessName,
      role: u.role,
      status: u.status,
      resellerId: u.resellerId,
      createdAt: u.createdAt.toISOString(),
      businessCategory: u.businessCategory ?? null,
      businessDescription: u.businessDescription ?? null,
      businessAddress: u.businessAddress ?? null,
      businessEmail: u.businessEmail ?? null,
      businessWebsite: u.businessWebsite ?? null,
      maxAgents: u.maxAgents ?? 1,
      plan: u.plan ?? "free",
      subscriptionExpiresAt: u.subscriptionExpiresAt ? u.subscriptionExpiresAt.toISOString() : null,
      onboardingCompleted: u.onboardingCompleted ?? false,
      agentCount: u._count.agents,
      billing: {
        state: b.state,
        creditsUsed: b.creditsUsed,
        walletCreditsUsed: b.walletCreditsUsed,
        creditLimit: b.creditLimit,
        walletBalance: u.creditBalance ?? 0,
        walletUsable: hasUsableWallet(u.creditBalance, u.creditsExpireAt, now),
      },
    }
  })

  const stateCounts = Object.fromEntries(BILLING_STATES.map((s) => [s, 0])) as Record<UserBillingState, number>
  for (const r of rows) stateCounts[r.billing.state]++

  const q = query.q.toLowerCase()
  const filtered = rows.filter((r) =>
    (!q || [r.name, r.email, r.businessName, r.phone ?? ""].some((f) => f.toLowerCase().includes(q))) &&
    (!query.billing || r.billing.state === query.billing) &&
    (!query.plan || r.plan === query.plan) &&
    (!query.status || r.status === query.status) &&
    (!query.onboarding || !r.onboardingCompleted)
  )

  if (query.sort === "credits") filtered.sort((a, b) => b.billing.creditsUsed - a.billing.creditsUsed)
  else if (query.sort === "wallet") filtered.sort((a, b) => b.billing.walletBalance - a.billing.walletBalance)
  else if (query.sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name))

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>
          {rows.length.toLocaleString()} total · {stateCounts.payg.toLocaleString()} on pay as you go · {stateCounts.over_limit.toLocaleString()} over the limit with no wallet
        </p>
      </div>

      <UserTable
        users={pageRows}
        query={{ ...query, page }}
        total={rows.length}
        matching={filtered.length}
        pageCount={pageCount}
        stateCounts={stateCounts}
      />
    </div>
  )
}
