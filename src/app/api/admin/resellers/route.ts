import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Super-admin (Dailzero) reseller management. ADMIN role only.
async function requireSuperAdmin() {
  const session = await auth()
  return session && session.user.role === "ADMIN" ? session : null
}

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const resellers = await db.reseller.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true, plans: true } } },
  })
  return NextResponse.json({ resellers })
}

// Provision a new reseller tenant + its admin account in one step.
export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const name = String(b?.name ?? "").trim()
  const domain = String(b?.domain ?? "").trim().toLowerCase()
  const appName = String(b?.appName ?? "").trim()
  const supportEmail = b?.supportEmail ? String(b.supportEmail).trim() : null
  const primaryColor = b?.primaryColor ? String(b.primaryColor).trim() : null
  const domainAliases = Array.isArray(b?.domainAliases)
    ? b.domainAliases.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean)
    : []
  const poolCredits = Math.max(0, Math.floor(Number(b?.poolCredits ?? 0)))
  const adminName = String(b?.adminName ?? "").trim()
  const adminEmail = String(b?.adminEmail ?? "").trim().toLowerCase()
  const adminPassword = String(b?.adminPassword ?? "")

  if (!name || !domain || !appName) return NextResponse.json({ error: "Name, domain and app name are required" }, { status: 400 })
  if (!adminName || !adminEmail || adminPassword.length < 8) {
    return NextResponse.json({ error: "Admin name, email and a password (8+ chars) are required" }, { status: 400 })
  }
  if (domain === "dailzero.com") return NextResponse.json({ error: "That domain is reserved" }, { status: 400 })

  const clash = await db.reseller.findFirst({ where: { OR: [{ domain }, { domainAliases: { has: domain } }] } })
  if (clash) return NextResponse.json({ error: "A reseller already uses that domain" }, { status: 409 })

  const reseller = await db.reseller.create({
    data: {
      name, domain, appName, supportEmail, primaryColor, domainAliases,
      creditPool: poolCredits, creditPoolTotal: poolCredits, status: "active",
    },
  })

  const passwordHash = await bcrypt.hash(adminPassword, 12)
  const admin = await db.user.create({
    data: {
      resellerId: reseller.id, email: adminEmail, name: adminName, businessName: name,
      passwordHash, role: "RESELLER_ADMIN", status: "APPROVED", emailVerified: true,
      onboardingCompleted: true, plan: "reseller",
    },
  }).catch(() => null)

  if (!admin) {
    // Roll back the reseller if the admin couldn't be created (e.g. dup email on tenant).
    await db.reseller.delete({ where: { id: reseller.id } }).catch(() => {})
    return NextResponse.json({ error: "Could not create the admin account (email may already be in use)" }, { status: 409 })
  }

  await db.reseller.update({ where: { id: reseller.id }, data: { adminUserId: admin.id } })
  return NextResponse.json({ reseller, adminEmail }, { status: 201 })
}
