import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLATFORM_RESELLER_ID } from "@/lib/tenant"

interface Params { params: Promise<{ id: string }> }

// Super-admin (Dailzero) reseller management. ADMIN role only.
async function requireSuperAdmin() {
  const session = await auth()
  return session && session.user.role === "ADMIN" ? session : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COLOUR_RE = /^#?[0-9a-fA-F]{3,8}$/

// Edit a reseller's profile — the same details used to create it (except the
// admin account and the credit pool, which have their own endpoints). Domain
// and aliases are DNS-tied, so they stay super-admin controlled here (a reseller
// can't change her own — see /api/reseller/settings).
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const existing = await db.reseller.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Reseller not found" }, { status: 404 })
  const isPlatform = id === PLATFORM_RESELLER_ID

  const b = await req.json().catch(() => ({}))
  const data: {
    name?: string; appName?: string; domain?: string; domainAliases?: string[]
    supportEmail?: string | null; primaryColor?: string | null; logoUrl?: string | null
    supportWhatsapp?: string | null; status?: string
  } = {}

  if (b?.name !== undefined) {
    const v = String(b.name).trim()
    if (!v) return NextResponse.json({ error: "Internal name can't be empty" }, { status: 400 })
    data.name = v
  }
  if (b?.appName !== undefined) {
    const v = String(b.appName).trim()
    if (!v) return NextResponse.json({ error: "App name can't be empty" }, { status: 400 })
    data.appName = v
  }

  // Domain + aliases: normalize, guard the reserved host, and enforce uniqueness
  // across OTHER resellers. The platform tenant's domain is fixed.
  let domain: string | undefined
  if (b?.domain !== undefined) {
    domain = String(b.domain).trim().toLowerCase()
    if (!domain) return NextResponse.json({ error: "Domain can't be empty" }, { status: 400 })
    if (isPlatform && domain !== existing.domain) {
      return NextResponse.json({ error: "The platform tenant's domain can't be changed here" }, { status: 400 })
    }
    if (!isPlatform && domain === "dailzero.com") {
      return NextResponse.json({ error: "That domain is reserved" }, { status: 400 })
    }
    data.domain = domain
  }
  let domainAliases: string[] | undefined
  if (b?.domainAliases !== undefined) {
    domainAliases = Array.isArray(b.domainAliases)
      ? [...new Set(b.domainAliases.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean) as string[])]
      : []
    if (!isPlatform && domainAliases.includes("dailzero.com")) {
      return NextResponse.json({ error: "That domain is reserved" }, { status: 400 })
    }
    data.domainAliases = domainAliases
  }

  // The effective host set after this update (fall back to stored values for any
  // field not being changed), checked for collisions with other resellers.
  const nextDomain = domain ?? existing.domain
  const nextAliases = domainAliases ?? existing.domainAliases
  // A domain that also sits in its own alias list is redundant — drop it.
  if (data.domainAliases !== undefined || domain !== undefined) {
    data.domainAliases = nextAliases.filter((h) => h !== nextDomain)
  }
  if (domain !== undefined || domainAliases !== undefined) {
    const hosts = [nextDomain, ...nextAliases]
    const clash = await db.reseller.findFirst({
      where: {
        id: { not: id },
        OR: hosts.flatMap((h) => [{ domain: h }, { domainAliases: { has: h } }]),
      },
      select: { appName: true },
    })
    if (clash) {
      return NextResponse.json({ error: `Another reseller (${clash.appName}) already uses one of those hosts` }, { status: 409 })
    }
  }

  if (b?.supportEmail !== undefined) {
    const v = String(b.supportEmail).trim()
    if (v && !EMAIL_RE.test(v)) return NextResponse.json({ error: "Invalid support email" }, { status: 400 })
    data.supportEmail = v || null
  }
  if (b?.primaryColor !== undefined) {
    const v = String(b.primaryColor).trim()
    if (v && !COLOUR_RE.test(v)) return NextResponse.json({ error: "Invalid colour" }, { status: 400 })
    data.primaryColor = v ? (v.startsWith("#") ? v : `#${v}`) : null
  }
  if (b?.logoUrl !== undefined) {
    data.logoUrl = String(b.logoUrl).trim() || null
  }
  if (b?.supportWhatsapp !== undefined) {
    data.supportWhatsapp = String(b.supportWhatsapp).trim() || null
  }
  if (b?.status !== undefined) {
    const v = String(b.status).trim().toLowerCase()
    if (v !== "active" && v !== "suspended") return NextResponse.json({ error: "Status must be active or suspended" }, { status: 400 })
    if (isPlatform && v === "suspended") return NextResponse.json({ error: "The platform tenant can't be suspended" }, { status: 400 })
    data.status = v
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const reseller = await db.reseller.update({ where: { id }, data })
  return NextResponse.json({ ok: true, reseller })
}
