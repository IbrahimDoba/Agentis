import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getResellerAdminContext } from "@/lib/resellerAdmin"

// A reseller editing her OWN tenant branding. Strictly her own row, and only
// the brand fields — domain/aliases/status/pool stay super-admin controlled
// (domain is DNS-tied; pool/status are Dailzero's to manage).
export async function GET() {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const reseller = await db.reseller.findUnique({
    where: { id: ctx.resellerId },
    select: {
      name: true, appName: true, logoUrl: true, primaryColor: true,
      supportEmail: true, domain: true, domainAliases: true,
    },
  })
  if (!reseller) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ reseller })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getResellerAdminContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const data: { name?: string; appName?: string; logoUrl?: string | null; primaryColor?: string | null; supportEmail?: string | null } = {}

  if (b?.name !== undefined) {
    const v = String(b.name).trim()
    if (!v) return NextResponse.json({ error: "Business name can't be empty" }, { status: 400 })
    data.name = v
  }
  if (b?.appName !== undefined) {
    const v = String(b.appName).trim()
    if (!v) return NextResponse.json({ error: "App name can't be empty" }, { status: 400 })
    data.appName = v
  }
  if (b?.logoUrl !== undefined) {
    const v = String(b.logoUrl).trim()
    data.logoUrl = v || null
  }
  if (b?.primaryColor !== undefined) {
    const v = String(b.primaryColor).trim()
    if (v && !/^#?[0-9a-fA-F]{3,8}$/.test(v)) return NextResponse.json({ error: "Invalid colour" }, { status: 400 })
    data.primaryColor = v ? (v.startsWith("#") ? v : `#${v}`) : null
  }
  if (b?.supportEmail !== undefined) {
    const v = String(b.supportEmail).trim()
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return NextResponse.json({ error: "Invalid support email" }, { status: 400 })
    data.supportEmail = v || null
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  await db.reseller.update({ where: { id: ctx.resellerId }, data })
  return NextResponse.json({ ok: true })
}
