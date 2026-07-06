import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Admin finance entries — manual expense/revenue lines for the /admin/finances
// P&L. Super-admin only. GET lists all; POST creates one.

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) return bad("Unauthorized", 401)
  const entries = await db.financeEntry.findMany({ orderBy: { incurredAt: "desc" } })
  return NextResponse.json({ entries })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return bad("Unauthorized", 401)

  const body = await req.json().catch(() => ({}))
  const kind = body?.kind === "revenue" ? "revenue" : body?.kind === "expense" ? "expense" : null
  if (!kind) return bad("kind must be 'expense' or 'revenue'")

  const label = typeof body?.label === "string" ? body.label.trim() : ""
  if (!label) return bad("Enter a label / category")

  const amount = Math.floor(Number(body?.amount))
  if (!Number.isFinite(amount) || amount <= 0) return bad("Enter a positive whole amount")

  const currency = typeof body?.currency === "string" && body.currency.trim()
    ? body.currency.trim().toUpperCase().slice(0, 8)
    : "NGN"
  const recurring = body?.recurring !== false
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const incurredAt = body?.incurredAt && !Number.isNaN(Date.parse(body.incurredAt))
    ? new Date(body.incurredAt)
    : undefined

  const entry = await db.financeEntry.create({
    data: { kind, label, amount, currency, recurring, note, ...(incurredAt ? { incurredAt } : {}) },
  })
  return NextResponse.json({ entry }, { status: 201 })
}
