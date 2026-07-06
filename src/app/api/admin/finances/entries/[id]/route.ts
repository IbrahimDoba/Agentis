import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Edit / delete a single finance entry. Super-admin only.

interface Params { params: Promise<{ id: string }> }

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  if (typeof body?.label === "string") {
    const label = body.label.trim()
    if (!label) return NextResponse.json({ error: "Label can't be empty" }, { status: 400 })
    data.label = label
  }
  if (body?.amount !== undefined) {
    const amount = Math.floor(Number(body.amount))
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a positive whole amount" }, { status: 400 })
    data.amount = amount
  }
  if (typeof body?.currency === "string" && body.currency.trim()) data.currency = body.currency.trim().toUpperCase().slice(0, 8)
  if (body?.recurring !== undefined) data.recurring = body.recurring !== false
  if (body?.note !== undefined) data.note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null
  if (body?.incurredAt && !Number.isNaN(Date.parse(body.incurredAt))) data.incurredAt = new Date(body.incurredAt)
  if (body?.kind === "expense" || body?.kind === "revenue") data.kind = body.kind

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const entry = await db.financeEntry.update({ where: { id }, data }).catch(() => null)
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  return NextResponse.json({ entry })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const deleted = await db.financeEntry.delete({ where: { id } }).catch(() => null)
  if (!deleted) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
