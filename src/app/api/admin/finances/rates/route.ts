import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { BASE_CURRENCY } from "@/lib/finance"

// FX rates for the finance tab (1 unit of `currency` = rateToBase NGN). Super-
// admin only. GET returns a { CODE: rate } map; PUT upserts one rate.

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const rows = await db.financeFxRate.findMany()
  const rates: Record<string, number> = {}
  for (const r of rows) rates[r.currency] = Number(r.rateToBase)
  return NextResponse.json({ rates })
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  const currency = typeof body?.currency === "string" ? body.currency.trim().toUpperCase().slice(0, 8) : ""
  if (!currency) return NextResponse.json({ error: "Enter a currency code" }, { status: 400 })
  if (currency === BASE_CURRENCY) {
    return NextResponse.json({ error: `${BASE_CURRENCY} is the base currency (rate is always 1)` }, { status: 400 })
  }
  const rate = Number(body?.rateToBase)
  if (!Number.isFinite(rate) || rate <= 0) {
    return NextResponse.json({ error: "Enter a positive exchange rate" }, { status: 400 })
  }

  await db.financeFxRate.upsert({
    where: { currency },
    create: { currency, rateToBase: rate },
    update: { rateToBase: rate },
  })
  return NextResponse.json({ ok: true, currency, rateToBase: rate })
}
